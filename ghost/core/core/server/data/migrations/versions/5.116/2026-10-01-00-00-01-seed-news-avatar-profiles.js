const ObjectId = require('bson-objectid').default;
const {createTransactionalMigration} = require('../../utils');

const PROFILES = [
    {
        slug: 'news-male-neutral',
        display_name: 'ニュース男性アナウンサー',
        description: '標準ニュース向けの落ち着いた男性プレゼンター',
        voice_name: 'Neil',
        persona: 'neutral',
        gender_presentation: 'male',
        default_for_news: true
    },
    {
        slug: 'news-female-neutral',
        display_name: 'ニュース女性アナウンサー',
        description: '知的で穏やかな女性プレゼンター',
        voice_name: 'Maia',
        persona: 'neutral',
        gender_presentation: 'female',
        default_for_news: false
    },
    {
        slug: 'news-calm-commentary',
        display_name: 'ニュース解説者',
        description: '特集・解説向けの落ち着いた男性プレゼンター',
        voice_name: 'Andre',
        persona: 'commentary',
        gender_presentation: 'male',
        default_for_news: false
    },
    {
        slug: 'news-breaking',
        display_name: '速報アナウンサー',
        description: '速報・特別報道向けの明瞭なプレゼンター',
        voice_name: 'Bellona',
        persona: 'breaking',
        gender_presentation: 'female',
        default_for_news: false
    }
].map(profile => ({
    ...profile,
    id: ObjectId().toHexString(),
    voice_provider: 'qwen',
    locale: 'ja-JP',
    provider: 'self-hosted',
    status: 'draft',
    rights_status: 'pending',
    disclosure_label: 'AI生成アナウンサー',
    created_by: null
}));

module.exports = createTransactionalMigration(
    async function up(knex) {
        const now = knex.raw('CURRENT_TIMESTAMP');
        for (const profile of PROFILES) {
            const exists = await knex('social_ai_avatar_profiles').where({slug: profile.slug}).first();
            if (!exists) {
                await knex('social_ai_avatar_profiles').insert({...profile, created_at: now, updated_at: now});
            }
        }
    },
    async function down(knex) {
        await knex('social_ai_avatar_profiles')
            .whereIn('slug', PROFILES.map(profile => profile.slug))
            .whereNull('created_by')
            .del();
    }
);
