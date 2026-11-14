// @ts-check
const crypto = require('crypto');
const {ValidationError} = require('@tryghost/errors');
const {STAFF_CODE_TYPES} = require('../auth/staff-reset-code-type');

/**
 * 同じ tokens の表に、スタッフの 6 桁の認証コードの行（パスワードの再設定・アカウント作成の招待）もある。
 * 会員のマジックリンクとしては使わせない
 */
function isStaffResetCodeRow(model) {
    try {
        return STAFF_CODE_TYPES.includes(JSON.parse(model.get('data') || '{}').type);
    } catch (err) {
        return false;
    }
}

/** 6 桁のコード（OTC）で入れるのは、token を作ってから 10 分まで（リンクの 24 時間より短く） */
const OTC_VALIDITY = 10 * 60 * 1000;

/**
 * otcRef の正しい形（token の行の id: 24 文字の小文字の 16 進）。
 * MySQL は大文字・小文字や後ろの空白が違っても同じ行を引くので、形が違うものは引く前に断る
 * （回数の制限を ref の書き方を変えてすり抜けさせない。brute.js の memberOtcVerifyPerRef も同じ形で数える）。
 */
const OTC_REF_PATTERN = /^[0-9a-f]{24}$/;

class SingleUseTokenProvider {
    /**
     * @param {Object} dependencies
     * @param {import('../../models/base')} dependencies.SingleUseTokenModel - A model for creating and retrieving tokens.
     * @param {number} dependencies.validityPeriod - How long a token is valid for from it's creation in milliseconds.
     * @param {number} dependencies.validityPeriodAfterUsage - How long a token is valid after first usage, in milliseconds.
     * @param {number} dependencies.maxUsageCount - How many times a token can be used.
     * @param {() => (string|undefined)} [dependencies.getOTCSecret] - 6 桁のコードを作る秘密（members_email_auth_secret）
     */
    constructor({SingleUseTokenModel, validityPeriod, validityPeriodAfterUsage, maxUsageCount, getOTCSecret}) {
        this.model = SingleUseTokenModel;
        this.getOTCSecret = getOTCSecret;
        this.validityPeriod = validityPeriod;
        this.validityPeriodAfterUsage = validityPeriodAfterUsage;
        this.maxUsageCount = maxUsageCount;
    }

    /**
     * @method create
     * Creates and stores a token, with the passed data associated with it.
     * Returns the created token value.
     *
     * @param {Object<string, any>} data
     *
     * @returns {Promise<string>}
     */
    async create(data) {
        const model = await this.model.add({
            data: JSON.stringify(data)
        });

        return model.get('token');
    }

    /**
     * @method createWithRef
     * create と同じに token を作り、6 桁のコードを引くための ref（その行の id）も返す
     * （jibunsee-react docs/planning/staff-password-reset-code.md §8）。
     *
     * @param {Object<string, any>} data
     * @returns {Promise<{token: string, ref: string}>}
     */
    async createWithRef(data) {
        const model = await this.model.add({
            data: JSON.stringify(data)
        });

        return {token: model.get('token'), ref: model.id};
    }

    /**
     * @method deriveOTC
     * token から 6 桁を作る（保存しない）。HMAC-SHA256(members_email_auth_secret, `${ref}:${token}`) を 10 進の 6 桁に。
     *
     * @param {string} ref
     * @param {string} token
     * @returns {string}
     */
    deriveOTC(ref, token) {
        const secret = this.getOTCSecret?.();
        if (!secret || !ref || !token) {
            throw new ValidationError({message: 'OTC secret not configured'});
        }
        const digest = crypto.createHmac('sha256', secret).update(`${ref}:${token}`).digest();
        return String(digest.readUInt32BE(0) % 1000000).padStart(6, '0');
    }

    /**
     * @method verifyOTC
     * ref の token が「作ってから 10 分以内」「まだ一度も使われていない」で、6 桁が合えば、その token を返す。
     * 合わなければ null（どこが違うかは言わない）。token はこの後 Ghost の中でセッションに替える（ブラウザには返さない）。
     *
     * 「まだ一度も使われていない」なので、メールのリンクを先に開かれた token（メールのリンクを自動で開く
     * 安全確認の仕組みも含む）では 6 桁は通らない。そのときはリンクで入る。
     * 合ったときは used_count を 0 → 1 に一度で替え（同じ 6 桁を同時に送っても通るのは 1 つだけ）、
     * その後のセッションへの替え（validate）は「使い始めて 10 分以内」として通る。
     *
     * @param {string} ref
     * @param {string} otc
     * @returns {Promise<string|null>}
     */
    async verifyOTC(ref, otc) {
        if (typeof ref !== 'string' || !OTC_REF_PATTERN.test(ref) || typeof otc !== 'string' || !/^\d{6}$/.test(otc.trim()) || !this.getOTCSecret?.()) {
            return null;
        }
        const model = await this.model.findOne({id: ref});
        if (!model || model.id !== ref) {
            return null;
        }
        if (Date.now() - model.get('created_at').getTime() > OTC_VALIDITY) {
            return null;
        }
        if (model.get('used_count') > 0) {
            return null;
        }
        const token = model.get('token');
        // 6 桁は、引いた行の本当の id で作って比べる
        const expected = Buffer.from(this.deriveOTC(model.id, token));
        const given = Buffer.from(otc.trim());
        if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
            return null;
        }
        // まだ使われていないときだけ、使ったことにする（同時に来た 2 つめ以降は 0 行で null）
        const now = new Date();
        const claimed = await this.model.forge().query()
            .where({id: model.id, used_count: 0})
            .update({used_count: 1, first_used_at: now, updated_at: now});
        if (!claimed) {
            return null;
        }
        return token;
    }

    /**
     * @method validate
     * Validates a token, returning any parsable data associated.
     * If the token is invalid the returned Promise will reject.
     *
     * @param {string} token
     *
     * @returns {Promise<Object<string, any>>}
     */
    async validate(token, options = {}) {
        if (!options.transacting) {
            return await this.model.transaction((transacting) => {
                return this.validate(token, {
                    ...options,
                    transacting
                });
            });
        }

        const model = await this.model.findOne({token}, {transacting: options.transacting, forUpdate: true});

        if (!model) {
            throw new ValidationError({
                message: 'Invalid token provided'
            });
        }

        if (model.get('used_count') >= this.maxUsageCount) {
            throw new ValidationError({
                message: 'Token expired'
            });
        }

        if (isStaffResetCodeRow(model)) {
            throw new ValidationError({
                message: 'Invalid token provided'
            });
        }

        const createdAtEpoch = model.get('created_at').getTime();
        const firstUsedAtEpoch = model.get('first_used_at')?.getTime() ?? createdAtEpoch;

        // Is this token already used?
        if (model.get('used_count') > 0) {
            const timeSinceFirstUsage = Date.now() - firstUsedAtEpoch;

            if (timeSinceFirstUsage > this.validityPeriodAfterUsage) {
                throw new ValidationError({
                    message: 'Token expired'
                });
            }
        }
        const tokenLifetimeMilliseconds = Date.now() - createdAtEpoch;

        if (tokenLifetimeMilliseconds > this.validityPeriod) {
            throw new ValidationError({
                message: 'Token expired'
            });
        }

        if (!model.get('first_used_at')) {
            await model.save({
                first_used_at: new Date(),
                updated_at: new Date(),
                used_count: model.get('used_count') + 1
            }, {autoRefresh: false, patch: true, transacting: options.transacting});
        } else {
            await model.save({
                used_count: model.get('used_count') + 1,
                updated_at: new Date()
            }, {autoRefresh: false, patch: true, transacting: options.transacting});
        }

        try {
            return JSON.parse(model.get('data'));
        } catch (err) {
            return {};
        }
    }
}

module.exports = SingleUseTokenProvider;
module.exports.OTC_VALIDITY = OTC_VALIDITY;
module.exports.OTC_REF_PATTERN = OTC_REF_PATTERN;
