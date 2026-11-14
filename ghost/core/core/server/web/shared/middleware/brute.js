const url = require('url');
const spamPrevention = require('./api/spam-prevention');

// 6 桁のコードの回数の制限は spamPrevention.codeAttempts（文は 6 桁専用、reset() で作り直す）

/** 6 桁のコードの口の本文から、数える鍵にするメール（小文字）。無ければ空 */
function resetCodeEmail(req) {
    const email = req.body?.password_reset_code?.[0]?.email;
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** 「アカウント作成」の招待の 6 桁: 頼まれたか（POST /invites/?include_code=true） */
function wantsInviteCode(req) {
    const value = req.query?.include_code;
    return value === true || value === 'true';
}

/** 招待の数える鍵にするメール（小文字）。送る口は invites[0].email、確かめる口は invitation_code[0].email */
function inviteCodeEmail(req) {
    const email = req.body?.invites?.[0]?.email ?? req.body?.invitation_code?.[0]?.email;
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * We set ignoreIP to false, because we tell brute-knex to use `req.ip`.
 * We can use `req.ip`, because express trust proxy option is enabled.
 */
module.exports = {
    /**
     * block per route per ip
     */
    globalBlock(req, res, next) {
        return spamPrevention.globalBlock().getMiddleware({
            ignoreIP: false,
            key: function (_req, _res, _next) {
                _next(url.parse(_req.url).pathname);
            }
        })(req, res, next);
    },
    /**
     * block per route per ip
     */
    globalReset(req, res, next) {
        return spamPrevention.globalReset().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                _next(url.parse(_req.url).pathname);
            }
        })(req, res, next);
    },
    /**
     * block per ip
     */
    userLogin(req, res, next) {
        return spamPrevention.userLogin().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                return _next('user_login');
            }
        })(req, res, next);
    },
    /**
     * block per user
     */
    userReset(req, res, next) {
        return spamPrevention.userReset().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                _next(`${_req.body.username}reset`);
            }
        })(req, res, next);
    },
    /**
     * パスワードの 6 桁のコード: メールごと（IP によらない）に送る回数を数える
     */
    resetCodeSendPerEmail(req, res, next) {
        return spamPrevention.codeAttempts('send').getMiddleware({
            ignoreIP: true,
            key(_req, _res, _next) {
                _next(`${resetCodeEmail(_req)}password_reset_code_send`);
            }
        })(req, res, next);
    },
    /**
     * パスワードの 6 桁のコード: IP ごとに確かめる回数を数える（たくさんのメールに少しずつ当てる推測を止める）
     */
    resetCodeVerifyPerIp(req, res, next) {
        return spamPrevention.codeAttempts('verify').getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                _next('password_reset_code_verify');
            }
        })(req, res, next);
    },
    /**
     * パスワードの 6 桁のコード: メール（アカウント）ごとに確かめる回数を数える（IP を変えた推測を止める）
     */
    resetCodeVerifyPerEmail(req, res, next) {
        return spamPrevention.codeAttempts('verify').getMiddleware({
            ignoreIP: true,
            key(_req, _res, _next) {
                _next(`${resetCodeEmail(_req)}password_reset_code_verify`);
            }
        })(req, res, next);
    },
    /**
     * block per IP
    */
    sendVerificationCode(req, res, next) {
        return spamPrevention.sendVerificationCode().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                return _next('send_verification_code');
            }
        })(req, res, next);
    },
    /**
     * block per IP
     */
    userVerification(req, res, next) {
        return spamPrevention.userVerification().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                return _next('user_verification');
            }
        })(req, res, next);
    },
    /**
     * block per ip
     */
    privateBlog(req, res, next) {
        return spamPrevention.privateBlog().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                _next('privateblog');
            }
        })(req, res, next);
    },

    /*
     * protect content api from brute force
     */
    contentApiKey(req, res, next) {
        return spamPrevention.contentApiKey().getMiddleware({
            ignoreIP: false
        })(req, res, function (err, ...rest) {
            if (!err) {
                // Reset any blocks if the request is authorized
                // This ensures that the count only goes up for
                // unauthorized requests.
                res.on('finish', function () {
                    if (res.statusCode < 400) {
                        req.brute.reset();
                    }
                });
            }
            return next(err, ...rest);
        });
    },

    /**
     * 会員の 6 桁のコード: 6 桁つきで送るのは、メールごと（IP によらない）に数える
     * （送り直すたびに ref ごとの推測の回数が戻るので、送る回数で全体を抑える）。6 桁を頼まない送信は今までどおり
     */
    memberOtcSendPerEmail(req, res, next) {
        const includeOTC = req.body?.includeOTC === true || req.body?.includeOTC === 'true';
        if (!includeOTC) {
            return next();
        }
        return spamPrevention.codeAttempts('send').getMiddleware({
            ignoreIP: true,
            key(_req, _res, _next) {
                const email = typeof _req.body?.email === 'string' ? _req.body.email.trim().toLowerCase() : '';
                _next(`${email}member_otc_send`);
            }
        })(req, res, next);
    },
    /**
     * 会員の 6 桁のコード: IP ごとに確かめる回数を数える（たくさんの otcRef に少しずつ当てる推測を止める）
     */
    memberOtcVerifyPerIp(req, res, next) {
        return spamPrevention.codeAttempts('verify').getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                _next('member_otc_verify');
            }
        })(req, res, next);
    },
    /**
     * 会員の 6 桁のコード: otcRef（送ったメール 1 通）ごとに確かめる回数を数える（IP を変えた推測を止める）
     */
    memberOtcVerifyPerRef(req, res, next) {
        return spamPrevention.codeAttempts('verify').getMiddleware({
            ignoreIP: true,
            key(_req, _res, _next) {
                // 正しい形（24 文字の小文字の 16 進）の ref だけをそのまま鍵に。それ以外は 1 つの鍵にまとめる
                // （書き方を変えた ref で別々に数えさせない。SingleUseTokenProvider.verifyOTC は形の違う ref を断る）
                const ref = _req.body?.otcRef;
                const key = typeof ref === 'string' && /^[0-9a-f]{24}$/.test(ref) ? ref : 'invalid';
                _next(`${key}member_otc_verify`);
            }
        })(req, res, next);
    },
    /**
     * 「アカウント作成」の招待の 6 桁: 送るのは IP ごとに数える（6 桁を頼まない招待は今までどおり）。
     * IP は front の /api/invites が渡す利用者の IP（X-Forwarded-For の最後の値だけ。jibunsee-react docs/planning/staff-signup-code.md）
     */
    inviteCodeSendPerIp(req, res, next) {
        if (!wantsInviteCode(req)) {
            return next();
        }
        return spamPrevention.codeAttempts('send').getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                _next('invite_code_send');
            }
        })(req, res, next);
    },
    /**
     * 「アカウント作成」の招待の 6 桁: 送るのはメールごと（IP によらない）にも数える
     */
    inviteCodeSendPerEmail(req, res, next) {
        if (!wantsInviteCode(req)) {
            return next();
        }
        return spamPrevention.codeAttempts('send').getMiddleware({
            ignoreIP: true,
            key(_req, _res, _next) {
                _next(`${inviteCodeEmail(_req)}invite_code_send`);
            }
        })(req, res, next);
    },
    /**
     * 「アカウント作成」の招待の 6 桁: IP ごとに確かめる回数を数える（たくさんの招待に少しずつ当てる推測を止める）
     */
    inviteCodeVerifyPerIp(req, res, next) {
        return spamPrevention.codeAttempts('verify').getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                _next('invite_code_verify');
            }
        })(req, res, next);
    },
    /**
     * 「アカウント作成」の招待の 6 桁: メールごとに確かめる回数を数える（IP を変えた推測を止める）
     */
    inviteCodeVerifyPerEmail(req, res, next) {
        return spamPrevention.codeAttempts('verify').getMiddleware({
            ignoreIP: true,
            key(_req, _res, _next) {
                _next(`${inviteCodeEmail(_req)}invite_code_verify`);
            }
        })(req, res, next);
    },
    /**
     * Block too many password guesses for the same email address
     */
    membersAuth(req, res, next) {
        return spamPrevention.membersAuth().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                if (_req.body.email) {
                    return _next(`${_req.body.email}login`);
                }

                return _next();
            }
        })(req, res, next);
    },

    /**
     * Blocks user enumeration
     */
    membersAuthEnumeration(req, res, next) {
        return spamPrevention.membersAuthEnumeration().prevent(req, res, next);
    },

    /**
     * Blocks webmention spam
     */

    webmentionsLimiter(req, res, next) {
        return spamPrevention.webmentionsBlock().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                return _next('webmention_blocked');
            }
        })(req, res, next);
    },

    /**
     * Blocks preview email spam
     */

    previewEmailLimiter(req, res, next) {
        return spamPrevention.emailPreviewBlock().getMiddleware({
            ignoreIP: false,
            key(_req, _res, _next) {
                return _next('preview_email_blocked');
            }
        })(req, res, next);
    }
};
