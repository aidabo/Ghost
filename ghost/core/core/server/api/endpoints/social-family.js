// @ts-nocheck
const errors = require('@tryghost/errors');
const DatabaseInfo = require('@tryghost/database-info');
const models = require('../../models');

// 家族ページの初期化 (docs/planning/simple-family-page-bootstrap-design.md)。
//
// - 認証済みの利用者だけ。ブラウザから来た user_id は使わない（context.user）。
// - 家族が無ければ「○○の家族」を作る（本人だけの非公開。owner member は SocialGroup.add が作る）。
// - 家族 -> 既定 project は social_ai_projects.default_group_id（NULL 可・UNIQUE）で 1:1。
//   project が無ければ「○○の記録」を作る。1つだけあればそれを既定にする。2つ以上は選ばない。
// - 同じ利用者の同時実行は users 行のロックで直列化。別利用者との競合は UNIQUE 違反で
//   負けた側が巻き戻り、勝った側を読み直して返す（project は増えない）。
//
// 応答（画面が読む形）:
//   通常: {group: {id, group_name}, project: {id, name}, created: {group, project},
//          needs_family_choice: false, needs_project_designation: false}
//   家族が複数: {groups: [{id, group_name}], needs_family_choice: true, group: null, project: null,
//                created: {group: false, project: false}}
//   project が複数で既定なし: {group, project: null, needs_project_designation: true}

const messages = {
    userRequired: 'No login user authentication.',
    familyNotFound: 'Family not found.',
    notFamilyMember: 'You are not a member of this family.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;

const displayNameOf = (user) => {
    const name = String(user.get('name') || '').trim();
    // 家族名・project 名は他のメンバーにも見える。名前が無ければメールのローカル部は使わない。
    return name || 'わたし';
};

const familyShape = group => ({id: String(group.id), group_name: String(group.group_name || '')});
const projectShape = project => (project ? {id: String(project.id), name: String(project.name || '')} : null);

const controller = {
    docName: 'socialfamily',

    bootstrap: {
        statusCode: 200,
        headers: {cacheInvalidate: false},
        options: ['group_id'],
        data: [],
        permissions: false,
        async query(frame) {
            const userId = getCurrentUserId(frame);
            if (!userId) {
                throw new errors.NoPermissionError({message: messages.userRequired});
            }

            const requestedGroupId = String(frame.options?.group_id || frame.data?.group_id || '').trim();

            const user = await models.User.findOne({id: userId});
            if (!user) {
                throw new errors.NotFoundError({message: messages.userRequired});
            }
            const displayName = displayNameOf(user);

            const knex = models.Base.knex;
            const isMySQL = DatabaseInfo.isMySQL(knex);
            let resolvedGroupId = requestedGroupId;

            const run = () => knex.transaction(async (transacting) => {
                // 同じ利用者の同時実行を直列化する（sqlite には FOR UPDATE が無い）。
                if (isMySQL) {
                    await transacting.raw('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
                }

                const memberships = await transacting('social_group_members as m')
                    .join('social_groups as g', 'g.id', 'm.group_id')
                    .where('m.user_id', userId)
                    .where('m.status', 'active')
                    .where('g.type', 'family')
                    .where('g.status', 'active')
                    .select('g.id as id', 'g.group_name as group_name');

                let group = null;
                let createdGroup = false;

                if (requestedGroupId) {
                    group = memberships.find(item => String(item.id) === requestedGroupId) || null;
                    if (!group) {
                        throw new errors.NoPermissionError({message: messages.notFamilyMember});
                    }
                } else if (memberships.length === 1) {
                    group = memberships[0];
                } else if (memberships.length > 1) {
                    // 複数の家族は、こちらで選ばない（画面が名前で選ぶ）。
                    return {
                        groups: memberships.map(familyShape),
                        needs_family_choice: true,
                        group: null,
                        project: null,
                        created: {group: false, project: false}
                    };
                }

                if (!group) {
                    const baseName = `${displayName}の家族`;
                    let created;
                    try {
                        created = await models.SocialGroup.add({
                            creator_id: userId,
                            group_name: baseName,
                            type: 'family',
                            status: 'active'
                        }, {transacting, context: frame.options.context});
                    } catch (err) {
                        // group_name は UNIQUE。同じ名前の家族が既にあるときだけ、短い接尾辞を足す。
                        if (err.code !== 'ER_DUP_ENTRY') {
                            throw err;
                        }
                        created = await models.SocialGroup.add({
                            creator_id: userId,
                            group_name: `${baseName}（${String(userId).slice(-4)}）`,
                            type: 'family',
                            status: 'active'
                        }, {transacting, context: frame.options.context});
                    }
                    group = {id: created.id, group_name: created.get('group_name')};
                    createdGroup = true;
                }

                resolvedGroupId = String(group.id);

                let project = await transacting('social_ai_projects')
                    .where({default_group_id: group.id})
                    .first();
                let createdProject = false;
                let needsProjectDesignation = false;

                if (!project) {
                    const existing = await transacting('social_ai_projects')
                        .where({group_id: group.id})
                        .select('id', 'name', 'group_id', 'default_group_id');

                    if (existing.length === 1) {
                        await transacting('social_ai_projects')
                            .where({id: existing[0].id})
                            .update({default_group_id: group.id, updated_at: new Date()});
                        project = {...existing[0], default_group_id: group.id};
                    } else if (existing.length === 0) {
                        const added = await models.SocialAiProject.add({
                            name: `${displayName}の記録`,
                            status: 'draft',
                            user_id: userId,
                            group_id: group.id,
                            default_group_id: group.id
                        }, {transacting, context: frame.options.context});
                        project = added.toJSON();
                        createdProject = true;
                    } else {
                        // 2つ以上あって既定が無い: 日時順で選ばない。管理者/本人が決める。
                        needsProjectDesignation = true;
                    }
                }

                return {
                    group: familyShape(group),
                    project: projectShape(project),
                    created: {group: createdGroup, project: createdProject},
                    needs_family_choice: false,
                    needs_project_designation: needsProjectDesignation
                };
            });

            try {
                return await run();
            } catch (err) {
                // 同じ家族の別利用者と同時に既定 project を作った場合: 負けた側は巻き戻る。
                // 勝った側の既定 project を読み直して返す（project は増えない）。
                const duplicate = err.code === 'ER_DUP_ENTRY' || /duplicate/i.test(String(err.message));
                if (!duplicate || !resolvedGroupId) {
                    throw err;
                }
                const winnerGroup = await knex('social_groups').where({id: resolvedGroupId}).first('id', 'group_name');
                if (!winnerGroup) {
                    throw err;
                }
                const winnerProject = await knex('social_ai_projects')
                    .where({default_group_id: resolvedGroupId})
                    .first('id', 'name');
                return {
                    group: familyShape(winnerGroup),
                    project: projectShape(winnerProject),
                    created: {group: false, project: false},
                    needs_family_choice: false,
                    needs_project_designation: !winnerProject
                };
            }
        }
    }
};

module.exports = controller;
