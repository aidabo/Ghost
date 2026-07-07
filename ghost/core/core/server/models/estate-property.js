const path = require('path');
const crypto = require('crypto');
const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const storage = require('../adapters/storage');
const ghostBookshelf = require('./base');

const messages = {
    notFound: 'estate property not found.',
    publishedDeleteBlocked: 'Published estate properties cannot be deleted.'
};

const ESTATE_SEARCH_INDEX_TABLE = 'estate_property_search_index';
const ESTATE_STATION_INDEX_TABLE = 'estate_property_station_index';
const ESTATE_SEARCH_CACHE_PREFIX = 'estate:property-search:v1:';
const ESTATE_SEARCH_CACHE_OPTION_KEYS = [
    'filter', 'include', 'withRelated', 'query', 'q', 'search', 'query_any', 'station_walk_minutes_max',
    'price_min', 'price_max', 'rent_min', 'rent_max', 'area_min', 'area_max',
    'deposit_min', 'deposit_max', 'key_money_min', 'key_money_max', 'yield_min', 'yield_max',
    'land_area_min', 'land_area_max', 'building_area_min', 'building_area_max',
    'year_built_min', 'year_built_max', 'building_age_max', 'nearest_station', 'railway_line',
    'features', 'tags', 'source_type', 'source', 'location', 'floor_plan', 'status',
    'property_type', 'page', 'limit', 'order'
];

let estateSearchRedisClient;
let estateSearchRedisUnavailable = false;
let estateSearchRedisWarned = false;

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[，、。．！？!?；;：:]/g, ' ')
        .replace(/[㎡ｍ²]/g, match => (match === '㎡' || match === '²' ? 'm2' : 'm'))
        .replace(/\s+/g, ' ')
        .trim();
}

function getEstateSearchRedisUrl() {
    if (process.env.ESTATE_SEARCH_REDIS_ENABLED === 'false') {
        return null;
    }
    return process.env.ESTATE_SEARCH_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

function getEstateSearchRedisTtlSeconds() {
    const ttl = Number(process.env.ESTATE_SEARCH_REDIS_TTL_SECONDS || 60);
    return Number.isFinite(ttl) && ttl > 0 ? Math.trunc(ttl) : 60;
}

async function getEstateSearchRedisClient() {
    const redisUrl = getEstateSearchRedisUrl();
    if (!redisUrl || estateSearchRedisUnavailable) {
        return null;
    }
    if (!estateSearchRedisClient) {
        try {
            const Redis = require('ioredis');
            estateSearchRedisClient = new Redis(redisUrl, {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                enableOfflineQueue: false,
                connectTimeout: 500
            });
            estateSearchRedisClient.on('error', (err) => {
                if (!estateSearchRedisWarned) {
                    estateSearchRedisWarned = true;
                    // eslint-disable-next-line no-console
                    console.warn(`[estate.search.cache] Redis unavailable, falling back to DB search: ${err.message}`);
                }
            });
        } catch (err) {
            estateSearchRedisUnavailable = true;
            return null;
        }
    }
    try {
        if (estateSearchRedisClient.status === 'wait' || estateSearchRedisClient.status === 'end') {
            await estateSearchRedisClient.connect();
        }
        return estateSearchRedisClient;
    } catch (err) {
        estateSearchRedisUnavailable = true;
        if (!estateSearchRedisWarned) {
            estateSearchRedisWarned = true;
            // eslint-disable-next-line no-console
            console.warn(`[estate.search.cache] Redis connect failed, falling back to DB search: ${err.message}`);
        }
        return null;
    }
}

// 自由テキスト検索フィールド: 全角/半角・㎡・空白・大小文字を吸収して
// 同義クエリ（例: `７０㎡` と `70㎡`）が同じキャッシュキーを共有できるようにする。
const ESTATE_SEARCH_CACHE_TEXT_KEYS = new Set([
    'query', 'q', 'search', 'query_any', 'location', 'floor_plan',
    'nearest_station', 'railway_line', 'features', 'tags'
]);

function normalizeEstateCacheValue(key, value) {
    const raw = String(value);
    // テキスト検索キーはパースと同じ正規化で畳み込む。
    // それ以外（filter/order/数値レンジ等）は NFKC+trim のみで全角数字だけ吸収し、
    // 構造化値の意味を変えないようにする。
    return ESTATE_SEARCH_CACHE_TEXT_KEYS.has(key)
        ? normalizeSearchText(raw)
        : raw.normalize('NFKC').trim();
}

function collectNormalizedEstateCacheOptions(options = {}) {
    const normalized = {};
    for (const key of ESTATE_SEARCH_CACHE_OPTION_KEYS) {
        if (options[key] !== undefined && options[key] !== null && options[key] !== '') {
            normalized[key] = normalizeEstateCacheValue(key, options[key]);
        }
    }
    return normalized;
}

function buildEstateSearchCacheKey(options = {}) {
    const normalized = collectNormalizedEstateCacheOptions(options);
    const digest = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
    return `${ESTATE_SEARCH_CACHE_PREFIX}${digest}`;
}

function normalizeEstateSearchCacheOptions(options = {}) {
    return collectNormalizedEstateCacheOptions(options);
}

async function readEstateSearchCache(options = {}) {
    const redis = await getEstateSearchRedisClient();
    if (!redis) {
        return null;
    }
    try {
        const raw = await redis.get(buildEstateSearchCacheKey(options));
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.ids) || !Number.isFinite(Number(parsed.total))) {
            return null;
        }
        return parsed;
    } catch (err) {
        return null;
    }
}

async function writeEstateSearchCache(options = {}, payload = {}) {
    const redis = await getEstateSearchRedisClient();
    if (!redis) {
        return;
    }
    try {
        await redis.set(
            buildEstateSearchCacheKey(options),
            JSON.stringify({
                ...payload,
                debug: {
                    options: normalizeEstateSearchCacheOptions(options)
                }
            }),
            'EX',
            getEstateSearchRedisTtlSeconds()
        );
    } catch (err) {
        // Cache write failure must never block estate search.
    }
}

async function invalidateEstateSearchCache() {
    const redis = await getEstateSearchRedisClient();
    if (!redis) {
        return;
    }
    try {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${ESTATE_SEARCH_CACHE_PREFIX}*`, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                await redis.del(keys);
            }
        } while (cursor !== '0');
    } catch (err) {
        // Cache invalidation failure is non-fatal because DB remains source of truth and TTL is short.
    }
}

function plainNumber(value) {
    const match = normalizeSearchText(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) {
        return null;
    }
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseJapaneseMoney(value) {
    const raw = normalizeSearchText(value)
        .replace(/,/g, '')
        .replace(/[¥￥円]/g, '')
        .replace(/価格|金額|売買|賃料|家賃|以下|以内|未満|以上|超|より|まで|<=|>=|<|>|=/g, '');

    let total = 0;
    let consumed = false;
    const okuMatch = raw.match(/(-?\d+(?:\.\d+)?)億/);
    if (okuMatch) {
        total += Number(okuMatch[1]) * 100000000;
        consumed = true;
    }
    const afterOku = okuMatch ? raw.slice((okuMatch.index || 0) + okuMatch[0].length) : raw;
    const manMatch = afterOku.match(/(-?\d+(?:\.\d+)?)万/);
    if (manMatch) {
        total += Number(manMatch[1]) * 10000;
        consumed = true;
    }
    if (consumed) {
        return Number.isFinite(total) ? Math.round(total) : null;
    }
    return plainNumber(raw);
}

function parseYear(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.trunc(value) : null;
    }
    const text = normalizeSearchText(value);
    const westernYear = text.match(/(?:19|20)\d{2}/)?.[0];
    if (westernYear) {
        return Number(westernYear);
    }
    const eraMatch = text.match(/(昭和|平成|令和|s|h|r)(元|\d{1,2})年?/i);
    if (eraMatch) {
        const era = eraMatch[1].toLowerCase();
        const eraYear = eraMatch[2] === '元' ? 1 : Number(eraMatch[2]);
        const base = era === '昭和' || era === 's' ? 1925 : era === '平成' || era === 'h' ? 1988 : 2018;
        const year = base + eraYear;
        return Number.isFinite(year) ? year : null;
    }
    const ageMatch = text.match(/築(\d{1,3})年/);
    if (ageMatch) {
        const year = new Date().getFullYear() - Number(ageMatch[1]);
        return Number.isFinite(year) ? year : null;
    }
    return null;
}

function parseStationAccess(text) {
    const normalized = normalizeSearchText(text);
    const access = [];
    const regex = /(?:(?:([^「」,、\s]+線)[^「」,、\s]*)?[「\"]?([^「」,、\s]+)駅?[」\"]?[^,、\n]*?(?:徒歩|歩|駅徒歩|駅まで|駅から|より徒歩)\s*(\d{1,3})\s*分)/g;
    let match;
    while ((match = regex.exec(normalized)) !== null) {
        access.push({
            line: String(match[1] || '').trim(),
            station: String(match[2] || '').replace(/駅$/, '').trim(),
            walkMinutes: Number(match[3])
        });
    }
    if (!access.length) {
        const fallback = normalized.match(/(?:徒歩|歩|駅徒歩|駅まで|駅から|より徒歩)\s*(\d{1,3})\s*分/);
        if (fallback) {
            access.push({line: '', station: '', walkMinutes: Number(fallback[1])});
        }
    }
    return access.filter(item => Number.isFinite(item.walkMinutes));
}

function parseFeatureList(value) {
    if (Array.isArray(value)) {
        return value.flatMap(parseFeatureList);
    }
    const text = String(value || '').trim();
    if (!text) {
        return [];
    }
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed.flatMap(parseFeatureList);
        }
    } catch (err) {
        // Plain text feature list.
    }
    return text.split(/[\n,、]/g).map(item => item.trim()).filter(Boolean);
}

function hasText(text, patterns) {
    const normalized = normalizeSearchText(text);
    return patterns.some(pattern => normalized.includes(pattern));
}

function boolFromText(text, patterns, explicit) {
    if (explicit === true) {
        return true;
    }
    if (explicit === false) {
        return false;
    }
    return hasText(text, patterns);
}

function compactText(parts) {
    return parts
        .flatMap(part => Array.isArray(part) ? part : [part])
        .map(part => String(part || '').trim())
        .filter(Boolean)
        .join(' | ')
        .slice(0, 64000);
}

async function hasSearchIndexTables(knex) {
    return await knex.schema.hasTable(ESTATE_SEARCH_INDEX_TABLE);
}

async function buildEstateSearchIndexRows(knex, propertyId) {
    const property = await knex('estate_properties').where({id: propertyId}).first();
    if (!property) {
        return null;
    }

    const tagRows = await knex('estate_property_tags as ept')
        .leftJoin('tags as t', 'ept.tag_id', 't.id')
        .where('ept.property_id', propertyId)
        .select(['t.name', 't.slug']);
    const mediaRows = await knex('estate_property_media as epm')
        .leftJoin('social_media_assets as sma', 'epm.media_id', 'sma.id')
        .where('epm.property_id', propertyId)
        .select(['epm.media_type', 'epm.caption', 'sma.asset_type', 'sma.original_filename', 'sma.storage_key', 'sma.tag_slug']);

    const features = parseFeatureList(property.features);
    const tags = tagRows.flatMap(row => [row.name, row.slug]).filter(Boolean);
    const mediaText = mediaRows.flatMap(row => [row.media_type, row.caption, row.asset_type, row.original_filename, row.storage_key, row.tag_slug]).filter(Boolean);
    const surroundingText = compactText([
        property.nearby_stores,
        property.nearby_hospitals,
        property.nearby_schools,
        property.nearby_parks,
        property.elementary_school_info,
        property.junior_school_info,
        property.school_info,
        property.preschool_info
    ]);
    const hazardText = compactText([
        property.hazard_map_url,
        property.liquefaction_info,
        property.flood_inundation_info,
        property.storm_surge_info,
        property.tsunami_info,
        property.landslide_warning_info,
        property.disaster_hazard_area_info,
        property.large_scale_fill_info,
        property.landslide_prevention_info,
        property.steep_slope_info
    ]);
    const equipmentText = compactText([
        property.features,
        property.parking_info,
        property.fixtures_and_fittings,
        property.building_manager,
        features
    ]);
    const stationAccess = parseStationAccess(compactText([property.transport_info, property.nearest_station]));
    const nearestStation = stationAccess.find(item => item.station) || stationAccess[0] || null;
    const walkValues = stationAccess.map(item => item.walkMinutes).filter(Number.isFinite);
    const yearBuilt = parseYear(property.year_built);
    const mediaCount = mediaRows.length;
    const mediaSearchText = normalizeSearchText(mediaText.join(' '));
    const featureSearchText = normalizeSearchText(compactText([features, equipmentText, tags]));
    const searchText = compactText([
        property.id,
        property.building_name,
        property.address,
        property.city,
        property.ward,
        property.prefecture,
        property.nearest_station,
        property.transport_info,
        property.floor_plan,
        property.layout_description,
        property.structure,
        property.direction,
        property.parking_info,
        property.property_type,
        property.status,
        property.source,
        property.source_company,
        tags,
        features,
        surroundingText,
        hazardText,
        mediaText
    ]);

    const row = {
        property_id: property.id,
        searchable_text: searchText,
        normalized_text: normalizeSearchText(searchText),
        address_text: compactText([property.prefecture, property.city, property.ward, property.address]),
        station_text: compactText([property.nearest_station, property.transport_info, stationAccess.map(item => item.station)]),
        line_text: compactText([stationAccess.map(item => item.line)]),
        tag_text: compactText(tags),
        feature_text: compactText(features),
        equipment_text: equipmentText,
        surrounding_text: surroundingText,
        hazard_text: hazardText,
        mlit_text: compactText([property.mlit_summary_data, property.mlit_data]),
        property_type: property.property_type || null,
        transaction_type: property.property_type || null,
        source_type: property.source || property.registered_by || null,
        status: property.status || 'draft',
        prefecture: property.prefecture || null,
        city: property.city || null,
        ward: property.ward || null,
        town: null,
        latitude: property.latitude || null,
        longitude: property.longitude || null,
        price_search_num: property.price_sale || property.price_rent_monthly || property.price_valuation || property.current_rent || property.expected_rent || null,
        price_sale_num: property.price_sale || null,
        price_rent_monthly_num: property.price_rent_monthly || null,
        total_monthly_cost_num: (Number(property.price_rent_monthly || 0) + Number(property.price_management_fee || 0) + Number(property.price_maintenance_fee || 0)) || null,
        management_fee_num: property.price_management_fee || null,
        repair_reserve_fee_num: property.price_maintenance_fee || null,
        deposit_num: property.price_deposit || null,
        key_money_num: property.price_key_money || null,
        expected_rent_num: property.expected_rent || null,
        current_rent_num: property.current_rent || null,
        expected_yield_num: property.expected_yield || null,
        current_yield_num: property.current_yield || null,
        floor_area_sqm_num: plainNumber(property.floor_area),
        land_area_sqm_num: plainNumber(property.land_area),
        building_area_sqm_num: plainNumber(property.building_area),
        balcony_area_sqm_num: null,
        layout_text: property.floor_plan || property.layout_description || null,
        room_count_num: plainNumber(property.floor_plan),
        ldk_count_num: /ldk/i.test(String(property.floor_plan || '')) ? plainNumber(property.floor_plan) : null,
        floor_number_num: property.floor_number || null,
        floors_total_num: property.floors_total || null,
        total_units_num: property.total_units || null,
        year_built_num: yearBuilt,
        building_age_num: yearBuilt ? Math.max(0, new Date().getFullYear() - yearBuilt) : null,
        structure_text: property.structure || null,
        direction_text: property.direction || null,
        nearest_station_name: nearestStation?.station || property.nearest_station || null,
        nearest_line_name: nearestStation?.line || null,
        nearest_station_walk_minutes_num: walkValues.length ? Math.min(...walkValues) : null,
        station_count_num: new Set(stationAccess.map(item => item.station).filter(Boolean)).size || null,
        line_count_num: new Set(stationAccess.map(item => item.line).filter(Boolean)).size || null,
        media_count_num: mediaCount,
        has_building_image: hasText(mediaSearchText, ['building', '外観', '建物']),
        has_floor_plan_image: hasText(mediaSearchText, ['floor_plan', 'floor-plan', '間取り', '図面']),
        has_room_image: hasText(mediaSearchText, ['room', '室内', '内観']),
        has_map_image: hasText(mediaSearchText, ['map', '地図']),
        has_video: hasText(mediaSearchText, ['video', '動画']),
        has_panorama: hasText(mediaSearchText, ['panorama', 'パノラマ']),
        has_pet_allowed: boolFromText(featureSearchText, ['ペット可', 'ペット相談', '犬可', '猫可'], property.pets_allowed),
        has_parking: hasText(featureSearchText, ['駐車場', 'parking']),
        has_bicycle_parking: hasText(featureSearchText, ['駐輪場']),
        has_bike_parking: hasText(featureSearchText, ['バイク置場', 'バイク']),
        has_auto_lock: boolFromText(featureSearchText, ['オートロック', 'auto lock'], property.building_auto_lock),
        has_elevator: hasText(featureSearchText, ['エレベーター', 'ev', 'elevator']),
        has_delivery_box: hasText(featureSearchText, ['宅配ボックス']),
        has_bath_toilet_separate: hasText(featureSearchText, ['バストイレ別', 'バス・トイレ別']),
        has_independent_washstand: hasText(featureSearchText, ['独立洗面', '洗面所独立']),
        has_indoor_washer_space: hasText(featureSearchText, ['室内洗濯機']),
        has_aircon: hasText(featureSearchText, ['エアコン']),
        has_floor_heating: hasText(featureSearchText, ['床暖房']),
        has_reheating_bath: hasText(featureSearchText, ['追い焚き', '追焚']),
        has_bathroom_dryer: hasText(featureSearchText, ['浴室乾燥']),
        has_system_kitchen: hasText(featureSearchText, ['システムキッチン']),
        has_renovated: hasText(featureSearchText, ['リノベーション', 'renovation']),
        has_reformed: hasText(featureSearchText, ['リフォーム', 'reform']),
        has_furniture: hasText(featureSearchText, ['家具付き', '家電付き']),
        has_internet_free: hasText(featureSearchText, ['インターネット無料', 'ネット無料']),
        is_corner_room: hasText(featureSearchText, ['角部屋']),
        is_top_floor: property.floor_number && property.floors_total ? Number(property.floor_number) === Number(property.floors_total) : hasText(featureSearchText, ['最上階']),
        is_south_facing: hasText(compactText([property.direction, featureSearchText]), ['南向き']),
        is_new_earthquake_standard: hasText(featureSearchText, ['新耐震']),
        is_investment_property: property.property_type === 'investment' || hasText(featureSearchText, ['投資', '収益']),
        zoning_text: null,
        building_coverage_ratio_num: null,
        floor_area_ratio_num: null,
        hazard_risk_text: hazardText,
        parse_warnings_json: null,
        source_updated_at: property.updated_at || property.created_at || new Date(),
        indexed_at: new Date()
    };

    return {
        row,
        stations: stationAccess.map((item, index) => ({
            id: ObjectId().toHexString(),
            property_id: property.id,
            station_name: item.station || property.nearest_station || '',
            railway_line: item.line || '',
            walk_minutes: item.walkMinutes,
            bus_minutes: null,
            bus_stop_name: null,
            sort_order: index,
            created_at: new Date(),
            updated_at: new Date()
        })).filter(item => item.station_name || Number.isFinite(item.walk_minutes))
    };
}

async function upsertEstateSearchIndex(propertyId, options = {}) {
    const knex = options.transacting || ghostBookshelf.knex;
    if (!await hasSearchIndexTables(knex)) {
        return false;
    }
    const payload = await buildEstateSearchIndexRows(knex, propertyId);
    if (!payload) {
        await knex(ESTATE_SEARCH_INDEX_TABLE).where({property_id: propertyId}).del();
        if (await knex.schema.hasTable(ESTATE_STATION_INDEX_TABLE)) {
            await knex(ESTATE_STATION_INDEX_TABLE).where({property_id: propertyId}).del();
        }
        return false;
    }

    const existing = await knex(ESTATE_SEARCH_INDEX_TABLE).where({property_id: propertyId}).first('property_id');
    if (existing) {
        await knex(ESTATE_SEARCH_INDEX_TABLE).where({property_id: propertyId}).update(payload.row);
    } else {
        await knex(ESTATE_SEARCH_INDEX_TABLE).insert(payload.row);
    }

    if (await knex.schema.hasTable(ESTATE_STATION_INDEX_TABLE)) {
        await knex(ESTATE_STATION_INDEX_TABLE).where({property_id: propertyId}).del();
        if (payload.stations.length > 0) {
            await knex(ESTATE_STATION_INDEX_TABLE).insert(payload.stations);
        }
    }
    return true;
}


function opFromText(text, defaultOp) {
    if (/>=|以上|以降/.test(text)) return '>=';
    if (/<=|以下|以内|まで/.test(text)) return '<=';
    if (/>|超|より大/.test(text)) return '>';
    if (/<|未満|より小/.test(text)) return '<';
    return defaultOp;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// あいまい表現（約/くらい/ぐらい/程度/前後/およそ/ほど）を数値・単位パースの前に除去する。
// 例: 「駅まで約15分ぐらい」→「駅まで15分」。除去しないと (a) 数値前の「約」で徒歩分の
// 正規表現がマッチせず条件化に失敗し、(b) 残った「ぐらい」等が後段 free-text LIKE の
// 必須トークンになって過剰絞り込み（0件化）を招く。
const ESTATE_QUERY_FILLER_PATTERN = /(?:およそ|約|くらい|ぐらい|程度|前後|ほど)/g;

function parseNaturalEstateSearchQuery(query) {
    let textQuery = normalizeSearchText(query)
        .replace(ESTATE_QUERY_FILLER_PATTERN, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const conditions = [];
    const consume = (regex, build) => {
        const matches = Array.from(textQuery.matchAll(regex));
        for (const match of matches) {
            const condition = build(match);
            if (!condition) {
                continue;
            }
            conditions.push(condition);
            textQuery = textQuery.replace(new RegExp(escapeRegExp(match[0]), 'g'), ' ');
        }
    };

    consume(/(?:専有面積|面積|広さ)?\s*([<>]=?\s*)?(\d+(?:\.\d+)?)\s*(?:m2|㎡|平米|平方メートル)\s*(以上|以下|以内|未満|超|より大きい|より小さい)?/gi, (match) => {
        const value = Number(match[2]);
        if (!Number.isFinite(value)) return null;
        return {field: 'area', op: opFromText(`${match[1] || ''}${match[3] || ''}`, '>='), value};
    });
    consume(/(?:土地面積|土地)\s*([<>]=?\s*)?(\d+(?:\.\d+)?)\s*(?:m2|㎡|平米|平方メートル)?\s*(以上|以下|以内|未満|超)?/gi, (match) => {
        const value = Number(match[2]);
        if (!Number.isFinite(value)) return null;
        return {field: 'land_area', op: opFromText(`${match[1] || ''}${match[3] || ''}`, '>='), value};
    });
    consume(/(?:建物面積|延床|建物)\s*([<>]=?\s*)?(\d+(?:\.\d+)?)\s*(?:m2|㎡|平米|平方メートル)?\s*(以上|以下|以内|未満|超)?/gi, (match) => {
        const value = Number(match[2]);
        if (!Number.isFinite(value)) return null;
        return {field: 'building_area', op: opFromText(`${match[1] || ''}${match[3] || ''}`, '>='), value};
    });
    consume(/(?:価格|金額|売買価格|賃料|家賃)?\s*([<>]=?\s*)?((?:\d+(?:\.\d+)?億)?\d*(?:\.\d+)?万?\d*)\s*(?:円)?\s*(以下|以内|未満|以上|超|まで)?/gi, (match) => {
        if (!/[億万]|円|価格|金額|賃料|家賃/.test(match[0])) return null;
        const value = parseJapaneseMoney(match[2]);
        if (value === null) return null;
        return {field: /賃料|家賃/.test(match[0]) ? 'rent' : 'price', op: opFromText(`${match[1] || ''}${match[3] || ''}`, '<='), value};
    });
    consume(/(?:駅(?:まで|徒歩)?|徒歩)\s*([<>]=?\s*)?(\d{1,3})\s*分(?:間)?\s*(以内|以下|未満|以上|超|まで)?/g, (match) => {
        const value = Number(match[2]);
        if (!Number.isFinite(value)) return null;
        return {field: 'station_walk_minutes', op: opFromText(`${match[1] || ''}${match[3] || '以内'}`, '<='), value};
    });
    consume(/築\s*(\d{1,3})\s*年\s*(以内|以下|未満|以上|超)?/g, (match) => {
        const value = Number(match[1]);
        if (!Number.isFinite(value)) return null;
        return {field: 'building_age', op: opFromText(match[2] || '以内', '<='), value};
    });
    consume(/((?:19|20)\d{2})\s*年?\s*(以降|以上|以前|以下|まで)?/g, (match) => {
        const value = Number(match[1]);
        if (!Number.isFinite(value)) return null;
        return {field: 'year_built', op: /以前|以下|まで/.test(match[2] || '') ? '<=' : '>=', value};
    });
    consume(/([^\s,、「」"]{1,40}線)\s*[「"]?([^\s,、「」"]{1,40})駅[」"]?/g, (match) => {
        return {field: 'line_station', railwayLine: match[1].trim(), stationName: match[2].replace(/駅$/, '').trim()};
    });
    consume(/[「"]?([^\s,、「」"]{1,40})駅[」"]?/g, (match) => {
        return {field: 'station_name', stationName: match[1].replace(/駅$/, '').trim()};
    });
    consume(/([^\s,、「」"]{1,40}線)/g, (match) => {
        return {field: 'railway_line', railwayLine: match[1].trim()};
    });

    return {textQuery: textQuery.replace(/\s+/g, ' ').trim(), conditions};
}

function applyNaturalCondition(qb, condition) {
    const setMinMax = (column, minAllowed = true, maxAllowed = true) => {
        if ((condition.op === '>=' || condition.op === '>') && minAllowed) qb.where(column, condition.op, condition.value);
        if ((condition.op === '<=' || condition.op === '<') && maxAllowed) qb.where(column, condition.op, condition.value);
        if (condition.op === '=') qb.where(column, condition.value);
    };
    if (condition.field === 'price') setMinMax('si.price_search_num');
    if (condition.field === 'rent') setMinMax('si.price_rent_monthly_num');
    if (condition.field === 'area') setMinMax('si.floor_area_sqm_num');
    if (condition.field === 'land_area') setMinMax('si.land_area_sqm_num');
    if (condition.field === 'building_area') setMinMax('si.building_area_sqm_num');
    if (condition.field === 'station_walk_minutes') setMinMax('si.nearest_station_walk_minutes_num', false, true);
    if (condition.field === 'building_age') setMinMax('si.building_age_num', false, true);
    if (condition.field === 'year_built') setMinMax('si.year_built_num');
}

function stationLike(value) {
    return `${normalizeSearchText(value).replace(/[\\%_]/g, '\\$&')}%`;
}

function addStationIndexExists(qb, filters = {}) {
    const stationName = normalizeSearchText(filters.stationName || '');
    const railwayLine = normalizeSearchText(filters.railwayLine || '');
    const walkMax = Number(filters.walkMax || 0);
    if (!stationName && !railwayLine && !(walkMax > 0)) {
        return;
    }

    qb.whereExists(function stationExists() {
        this.select(1)
            .from(`${ESTATE_STATION_INDEX_TABLE} as sti`)
            .whereRaw('sti.property_id = si.property_id');
        if (stationName) {
            this.where('sti.station_name', 'like', stationLike(stationName));
        }
        if (railwayLine) {
            this.where('sti.railway_line', 'like', stationLike(railwayLine));
        }
        if (walkMax > 0) {
            this.where('sti.walk_minutes', '<=', walkMax);
        }
    });
}

function hasAdvancedEstateSearchOptions(options = {}) {
    const keys = [
        'query', 'q', 'search', 'query_any', 'station_walk_minutes_max', 'price_min', 'price_max', 'rent_min', 'rent_max',
        'area_min', 'area_max', 'deposit_min', 'deposit_max', 'key_money_min', 'key_money_max', 'yield_min', 'yield_max', 'land_area_min', 'land_area_max', 'building_area_min', 'building_area_max',
        'year_built_min', 'year_built_max', 'building_age_max', 'nearest_station', 'railway_line', 'features', 'tags',
        'source_type', 'source', 'status', 'location', 'floor_plan'
    ];
    return keys.some(key => options[key] !== undefined && options[key] !== null && String(options[key]).trim() !== '');
}

function addWhereLike(qb, columns, tokens) {
    for (const token of tokens) {
        const like = `%${token.replace(/[\\%_]/g, '\\$&')}%`;
        qb.where(function whereToken() {
            for (const column of columns) {
                this.orWhere(column, 'like', like);
            }
        });
    }
}

function addWhereAnyLike(qb, columns, terms) {
    const normalizedTerms = String(terms || '')
        .split(',')
        .map(term => normalizeSearchText(term))
        .filter(Boolean);
    if (!normalizedTerms.length) {
        return;
    }

    qb.where(function whereAnyTerm() {
        for (const term of normalizedTerms) {
            const tokens = term.split(/[\s,]+/g).map(token => token.trim()).filter(Boolean);
            if (!tokens.length) {
                continue;
            }
            this.orWhere(function whereOneTerm() {
                for (const token of tokens) {
                    const like = `%${token.replace(/[\\%_]/g, '\\$&')}%`;
                    this.where(function whereToken() {
                        for (const column of columns) {
                            this.orWhere(column, 'like', like);
                        }
                    });
                }
            });
        }
    });
}

function addBooleanFeatureFilter(qb, values) {
    const features = String(values || '').split(',').map(value => normalizeSearchText(value)).filter(Boolean);
    for (const feature of features) {
        if (['pet', 'pets', 'ペット可', 'ペット'].includes(feature)) qb.where('si.has_pet_allowed', true);
        else if (['parking', '駐車場'].includes(feature)) qb.where('si.has_parking', true);
        else if (['auto_lock', 'オートロック'].includes(feature)) qb.where('si.has_auto_lock', true);
        else if (['elevator', 'エレベーター'].includes(feature)) qb.where('si.has_elevator', true);
        else if (['delivery_box', '宅配ボックス'].includes(feature)) qb.where('si.has_delivery_box', true);
        else addWhereLike(qb, ['si.feature_text', 'si.equipment_text', 'si.tag_text'], [feature]);
    }
}

function applyEstateSearchFilters(qb, options = {}) {
    const parsedQuery = parseNaturalEstateSearchQuery(options.query || options.q || options.search || '');
    const naturalStationFilters = {stationName: '', railwayLine: '', walkMax: 0};
    for (const condition of parsedQuery.conditions) {
        if (condition.field === 'station_walk_minutes') {
            naturalStationFilters.walkMax = condition.value;
            continue;
        }
        if (condition.field === 'station_name') {
            naturalStationFilters.stationName = condition.stationName;
            continue;
        }
        if (condition.field === 'railway_line') {
            naturalStationFilters.railwayLine = condition.railwayLine;
            continue;
        }
        if (condition.field === 'line_station') {
            naturalStationFilters.stationName = condition.stationName;
            naturalStationFilters.railwayLine = condition.railwayLine;
            continue;
        }
        applyNaturalCondition(qb, condition);
    }
    const queryText = normalizeSearchText(parsedQuery.textQuery);
    const tokens = queryText.split(/[\s,]+/g).map(token => token.trim()).filter(Boolean);
    if (tokens.length > 0) {
        addWhereLike(qb, [
            'si.normalized_text', 'si.address_text', 'si.station_text', 'si.line_text',
            'si.tag_text', 'si.feature_text', 'si.equipment_text', 'si.surrounding_text', 'si.hazard_text'
        ], tokens);
    }
    if (options.query_any) {
        addWhereAnyLike(qb, [
            'si.normalized_text', 'si.address_text', 'si.station_text', 'si.line_text',
            'si.tag_text', 'si.feature_text', 'si.equipment_text', 'si.surrounding_text', 'si.hazard_text'
        ], options.query_any);
    }

    if (options.filter && String(options.filter).includes('status:published')) {
        qb.where('ep.status', 'published');
    }
    if (options.status) qb.whereIn('ep.status', String(options.status).split(',').map(v => v.trim()).filter(Boolean));
    if (options.property_type) qb.whereIn('ep.property_type', String(options.property_type).split(',').map(v => v.trim()).filter(Boolean));
    if (options.source_type || options.source) qb.whereIn('si.source_type', String(options.source_type || options.source).split(',').map(v => v.trim()).filter(Boolean));
    if (options.location) addWhereLike(qb, ['si.address_text', 'si.normalized_text'], [normalizeSearchText(options.location)]);
    if (options.nearest_station || options.railway_line || Number(options.station_walk_minutes_max) > 0 || naturalStationFilters.stationName || naturalStationFilters.railwayLine || Number(naturalStationFilters.walkMax) > 0) {
        addStationIndexExists(qb, {
            stationName: options.nearest_station || naturalStationFilters.stationName,
            railwayLine: options.railway_line || naturalStationFilters.railwayLine,
            walkMax: Number(options.station_walk_minutes_max) > 0 ? Number(options.station_walk_minutes_max) : naturalStationFilters.walkMax
        });
    }
    if (Number(options.price_min) > 0) qb.where('si.price_search_num', '>=', Number(options.price_min));
    if (Number(options.price_max) > 0) qb.where('si.price_search_num', '<=', Number(options.price_max));
    if (Number(options.rent_min) > 0) qb.where('si.price_rent_monthly_num', '>=', Number(options.rent_min));
    if (Number(options.rent_max) > 0) qb.where('si.price_rent_monthly_num', '<=', Number(options.rent_max));
    if (Number(options.deposit_min) > 0) qb.where('si.deposit_num', '>=', Number(options.deposit_min));
    if (Number(options.deposit_max) > 0) qb.where('si.deposit_num', '<=', Number(options.deposit_max));
    if (Number(options.key_money_min) > 0) qb.where('si.key_money_num', '>=', Number(options.key_money_min));
    if (Number(options.key_money_max) > 0) qb.where('si.key_money_num', '<=', Number(options.key_money_max));
    if (Number(options.yield_min) > 0) qb.where(function whereYieldMin() {
        this.where('si.expected_yield_num', '>=', Number(options.yield_min)).orWhere('si.current_yield_num', '>=', Number(options.yield_min));
    });
    if (Number(options.yield_max) > 0) qb.where(function whereYieldMax() {
        this.where('si.expected_yield_num', '<=', Number(options.yield_max)).orWhere('si.current_yield_num', '<=', Number(options.yield_max));
    });
    if (Number(options.area_min) > 0) qb.where('si.floor_area_sqm_num', '>=', Number(options.area_min));
    if (Number(options.area_max) > 0) qb.where('si.floor_area_sqm_num', '<=', Number(options.area_max));
    if (Number(options.land_area_min) > 0) qb.where('si.land_area_sqm_num', '>=', Number(options.land_area_min));
    if (Number(options.land_area_max) > 0) qb.where('si.land_area_sqm_num', '<=', Number(options.land_area_max));
    if (Number(options.building_area_min) > 0) qb.where('si.building_area_sqm_num', '>=', Number(options.building_area_min));
    if (Number(options.building_area_max) > 0) qb.where('si.building_area_sqm_num', '<=', Number(options.building_area_max));
    if (Number(options.year_built_min) > 0) qb.where('si.year_built_num', '>=', Number(options.year_built_min));
    if (Number(options.year_built_max) > 0) qb.where('si.year_built_num', '<=', Number(options.year_built_max));
    if (Number(options.building_age_max) > 0) qb.where('si.building_age_num', '<=', Number(options.building_age_max));
    if (options.floor_plan) addWhereLike(qb, ['si.layout_text'], [normalizeSearchText(options.floor_plan)]);
    if (options.tags) addWhereLike(qb, ['si.tag_text'], String(options.tags).split(',').map(normalizeSearchText));
    if (options.features) addBooleanFeatureFilter(qb, options.features);
}

function resolveStorageKeyRef(store, rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) {
        return null;
    }

    let key = value;
    if (/^https?:\/\//i.test(value)) {
        try {
            key = new URL(value).pathname || value;
        } catch (err) {
            key = value;
        }
    }

    const host = String(store?.host || '').trim();
    if (host && key.startsWith(host)) {
        key = key.slice(host.length);
    }

    key = key.replace(/^\/+/, '');
    if (!key) {
        return null;
    }

    return {
        key,
        targetDir: path.dirname(key),
        fileName: path.basename(key)
    };
}

async function cleanupGalleryFiles(propertyId, assets) {
    const propertyPrefix = `gallery/properties/${String(propertyId || '').trim()}`;
    if (!propertyPrefix) {
        return;
    }

    const mediaStore = storage.getStorage('media');
    if (!mediaStore || typeof mediaStore.delete !== 'function') {
        return;
    }

    const deleteByPrefix = async () => {
        if (typeof mediaStore.list !== 'function') {
            return false;
        }

        try {
            let continuationToken = null;
            do {
                const listing = await mediaStore.list({
                    prefix: propertyPrefix,
                    continuationToken
                });
                const items = Array.isArray(listing?.items) ? listing.items : [];
                for (const item of items) {
                    const key = String(item?.path || item?.key || '').trim();
                    if (!key) {
                        continue;
                    }
                    const targetDir = path.dirname(key);
                    const fileName = path.basename(key);
                    await mediaStore.delete(fileName, targetDir);
                }
                continuationToken = listing?.nextCursor || null;
            } while (continuationToken);
            return true;
        } catch (err) {
            return false;
        }
    }

    const listed = await deleteByPrefix();
    if (listed) {
        return;
    }

    const fallbackAssets = Array.isArray(assets) ? assets : [];
    for (const asset of fallbackAssets) {
        for (const url of [asset?.storage_url, asset?.thumbnail_url]) {
            const normalized = String(url || '').trim();
            if (!normalized) {
                continue;
            }

            try {
                const fileRef = resolveStorageKeyRef(mediaStore, normalized);
                if (!fileRef) {
                    continue;
                }
                const {targetDir, fileName} = fileRef;
                await mediaStore.delete(fileName, targetDir);
            } catch (err) {
                // Best-effort cleanup. DB cleanup should still succeed.
            }
        }
    }
}

const EstateProperty = ghostBookshelf.Model.extend({
    tableName: 'estate_properties',

    defaults() {
        const id = ObjectId().toHexString();
        return {
            id,
            status: 'draft',
            property_type: 'sale',
            internal_inquiry_id: `INQ-${id}`,
            sort_order: 0,
            featured: false,
            pets_allowed: false
        };
    },

    // Relations
    posts() {
        return this.hasMany('EstatePropertyPost', 'property_id');
    },

    propertyTags() {
        return this.hasMany('EstatePropertyTag', 'property_id');
    },

    staff() {
        return this.hasMany('EstatePropertyStaff', 'property_id');
    },

    tags() {
        return this.belongsToMany('Tag', 'estate_property_tags', 'property_id', 'tag_id');
    },

    media() {
        return this.hasMany('EstatePropertyMedium', 'property_id');
    },

    inquiries() {
        return this.hasMany('EstateInquiry', 'property_id');
    },

    socialMediaAssets() {
        return this.belongsToMany('SocialMediaAsset', 'estate_property_media', 'property_id', 'media_id');
    },

    ghostPosts() {
        return this.belongsToMany('Post', 'estate_property_posts', 'property_id', 'post_id');
    },

    staffUsers() {
        return this.belongsToMany('User', 'estate_property_staff', 'property_id', 'user_id');
    }
}, {
    hasAdvancedEstateSearchOptions,

    // Attach an ordered `images` array (and `feature_image`) to each property in
    // a page/model, from estate_property_media + social_media_assets. Batch (one
    // query for all result ids). Ordering: is_primary first, then a
    // building-related caption/tag, then sort_order — so images[0] is the card image.
    async attachMediaImages(pageOrModels) {
        const models = Array.isArray(pageOrModels)
            ? pageOrModels
            : (pageOrModels && Array.isArray(pageOrModels.data) ? pageOrModels.data
                : (pageOrModels && Array.isArray(pageOrModels.models) ? pageOrModels.models
                    : (pageOrModels ? [pageOrModels] : [])));
        const ids = models.map(m => m && m.id).filter(Boolean);
        if (ids.length === 0) {
            return pageOrModels;
        }

        const knex = ghostBookshelf.knex;
        // Do NOT filter by media_type = 'image': classified images may carry a
        // media_type like 'building' / 'floor_plan' / 'room'. Fetch all media and
        // exclude only videos below, so every image is available to the card.
        const rows = await knex('estate_property_media as epm')
            .leftJoin('social_media_assets as sma', 'epm.media_id', 'sma.id')
            .whereIn('epm.property_id', ids)
            .select([
                'epm.property_id', 'epm.is_primary', 'epm.caption', 'epm.sort_order', 'epm.media_type',
                'sma.storage_url', 'sma.thumbnail_url', 'sma.asset_type', 'sma.tag_slug'
            ]);

        const buildingKeywords = ['building', 'exterior', '外観', '建物'];
        // Detect videos by URL extension too — media_type/asset_type may be missing
        // or misclassified (e.g. a .mp4 stored as media_type 'image').
        const isVideoUrl = u => /\.(?:mp4|mov|m4v|webm|avi|mkv|ogv|flv|wmv)(?:[?#].*)?$/i.test(String(u || ''));
        const byProperty = new Map();
        for (const r of rows) {
            const mediaTypeRaw = r.media_type || 'image';
            const mediaType = String(mediaTypeRaw).toLowerCase();
            const assetType = String(r.asset_type || '').toLowerCase();
            const storageUrl = r.storage_url || '';
            // A usable poster is a non-video thumbnail image.
            const thumbUrl = (r.thumbnail_url && !isVideoUrl(r.thumbnail_url)) ? r.thumbnail_url : '';
            const isVideo = mediaType.includes('video') || assetType.includes('video') || isVideoUrl(storageUrl);
            // Keep BOTH the real media URL (for playback) and a displayable poster
            // image. Video: url = the video, poster = thumbnail (an image) if present.
            // Image: url = the image (fallback to a non-video thumbnail).
            const url = isVideo ? storageUrl : (storageUrl || thumbUrl);
            const poster = isVideo ? thumbUrl : (storageUrl || thumbUrl);
            if (!url) {
                continue;
            }
            const captionText = `${r.caption || ''} ${r.tag_slug || ''} ${mediaType}`.toLowerCase();
            const list = byProperty.get(r.property_id) || [];
            list.push({
                url,                              // real media (image or video)
                thumbnail_url: poster || url,     // displayable poster/thumbnail image
                poster: poster || null,           // explicit poster for videos (null if none)
                caption: r.caption || '',
                is_primary: !!r.is_primary,
                media_type: isVideo ? 'video' : mediaTypeRaw,
                is_video: isVideo,
                _building: buildingKeywords.some(k => captionText.includes(k)),
                _order: r.sort_order == null ? 9999 : Number(r.sort_order)
            });
            byProperty.set(r.property_id, list);
        }
        for (const list of byProperty.values()) {
            list.sort((a, b) =>
                (Number(b.is_primary) - Number(a.is_primary)) ||
                (Number(b._building) - Number(a._building)) ||
                (a._order - b._order));
        }
        for (const model of models) {
            if (!model || !model.id || typeof model.set !== 'function') {
                continue;
            }
            const list = (byProperty.get(model.id) || []).map(({url, thumbnail_url, poster, caption, is_primary, media_type, is_video}) =>
                ({url, thumbnail_url, poster, caption, is_primary, media_type, is_video}));
            model.set('images', list);
            // feature_image = single card thumbnail; must be an image (poster for videos).
            const firstImage = list.find(e => e.thumbnail_url && !isVideoUrl(e.thumbnail_url));
            model.set('feature_image', firstImage ? firstImage.thumbnail_url : null);
        }
        return pageOrModels;
    },

    async reindexSearch(propertyId, options = {}) {
        const result = await upsertEstateSearchIndex(propertyId, options);
        await invalidateEstateSearchCache();
        return result;
    },

    async reindexAllSearch(options = {}) {
        const knex = options.transacting || ghostBookshelf.knex;
        if (!await hasSearchIndexTables(knex)) {
            return 0;
        }
        const rows = await knex('estate_properties').select('id');
        let count = 0;
        for (const row of rows) {
            if (await upsertEstateSearchIndex(row.id, options)) {
                count += 1;
            }
        }
        if (await knex.schema.hasTable('estate_search_index_meta')) {
            const metaRow = {key: 'index_version', value: `${new Date().toISOString()}:${count}`, updated_at: new Date()};
            const existing = await knex('estate_search_index_meta').where({key: metaRow.key}).first('key');
            if (existing) {
                await knex('estate_search_index_meta').where({key: metaRow.key}).update(metaRow);
            } else {
                await knex('estate_search_index_meta').insert(metaRow);
            }
        }
        await invalidateEstateSearchCache();
        return count;
    },

    async findPageWithEstateSearch(unfilteredOptions = {}) {
        const options = this.filterOptions(unfilteredOptions, 'findPage', {extraAllowedProperties: [
            'query', 'q', 'search', 'query_any', 'station_walk_minutes_max', 'price_min', 'price_max', 'rent_min', 'rent_max',
            'area_min', 'area_max', 'deposit_min', 'deposit_max', 'key_money_min', 'key_money_max', 'yield_min', 'yield_max', 'land_area_min', 'land_area_max', 'building_area_min', 'building_area_max',
            'year_built_min', 'year_built_max', 'building_age_max', 'nearest_station', 'railway_line', 'features', 'tags',
            'source_type', 'source', 'location', 'floor_plan', 'status', 'property_type'
        ]});
        const knex = ghostBookshelf.knex;
        if (!await hasSearchIndexTables(knex)) {
            return this.findPage(unfilteredOptions);
        }

        const indexedCount = await knex(ESTATE_SEARCH_INDEX_TABLE).count({total: 'property_id'}).first();
        if (Number(indexedCount?.total || 0) === 0) {
            await this.reindexAllSearch(options);
        }

        const page = Math.max(1, Number(options.page || 1));
        const limit = Math.min(200, Math.max(1, Number(options.limit || 15)));
        const offset = (page - 1) * limit;
        const cached = await readEstateSearchCache(options);
        let total = Number(cached?.total || 0);
        let ids = Array.isArray(cached?.ids) ? cached.ids.filter(Boolean) : [];

        if (!cached) {
            const baseQuery = knex(`${ESTATE_SEARCH_INDEX_TABLE} as si`)
                .innerJoin('estate_properties as ep', 'si.property_id', 'ep.id');
            applyEstateSearchFilters(baseQuery, options);

            const countRow = await baseQuery.clone().clearSelect().clearOrder().countDistinct({total: 'ep.id'}).first();
            total = Number(countRow?.total || 0);
            const rows = await baseQuery.clone()
                .clearSelect()
                .select('ep.id')
                .orderBy('ep.updated_at', 'desc')
                .orderBy('ep.created_at', 'desc')
                .limit(limit)
                .offset(offset);
            ids = rows.map(row => row.id).filter(Boolean);
            await writeEstateSearchCache(options, {ids, total});
        }

        if (!ids.length) {
            return {
                data: [],
                meta: {pagination: {page, limit, pages: Math.max(1, Math.ceil(total / limit)), total}}
            };
        }

        const orderCases = ids.map((id, index) => `WHEN ? THEN ${index}`).join(' ');
        const collection = this.getFilteredCollection({...options, filter: undefined});
        collection.query((qb) => {
            qb.whereIn('estate_properties.id', ids);
            qb.orderByRaw(`CASE estate_properties.id ${orderCases} ELSE ${ids.length} END`, ids);
        });
        const result = await collection.fetchAll(options);
        if (options.withRelated) {
            result.models.forEach((item) => {
                item.withRelated = options.withRelated;
            });
        }

        return {
            data: result.models,
            meta: {pagination: {page, limit, pages: Math.max(1, Math.ceil(total / limit)), total}}
        };
    },

    orderDefaultOptions() {
        return {
            'estate_properties.sort_order': 'ASC',
            'estate_properties.created_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id', 'status', 'property_type',
        'price_sale', 'price_rent_monthly', 'price_management_fee',
        'price_deposit', 'price_key_money', 'price_maintenance_fee', 'price_other_fees',
        'floor_plan', 'floor_area', 'land_area', 'building_area',
        'year_built', 'floors_total', 'floor_number',
        'layout_description',
        'address', 'city', 'ward', 'prefecture',
        'postal_code', 'latitude', 'longitude',
        'transport_info', 'nearest_station',
        'total_units', 'structure', 'direction', 'parking_info', 'pets_allowed',
        'expected_yield', 'current_yield', 'expected_rent',
        'features', 'featured', 'sort_order',
        'group_id',
        'internal_inquiry_id', 'registrant_notes',
        'source', 'source_company', 'source_url', 'source_pdf_url', 'source_id', 'registered_by',
        'created_at', 'updated_at', 'created_by', 'updated_by',
        'google_map_url', 'google_3d_url', 'google_places_data', 'mlit_summary_data', 'street_view_url', 'hazard_map_url',
        'nearby_stores', 'nearby_hospitals', 'nearby_schools', 'nearby_parks',
        'elementary_school_info', 'junior_school_info', 'school_info', 'preschool_info',
        'liquefaction_info', 'flood_inundation_info', 'storm_surge_info', 'tsunami_info',
        'landslide_warning_info', 'disaster_hazard_area_info', 'large_scale_fill_info',
        'landslide_prevention_info', 'steep_slope_info',
        'building_auto_lock', 'building_manager',
        'mlit_data'
    ],

    relationships: ['posts', 'propertyTags', 'staff', 'tags', 'media', 'inquiries', 'socialMediaAssets', 'ghostPosts', 'staffUsers'],

    includeRelations: ['posts', 'staff', 'tags', 'media', 'inquiries', 'socialMediaAssets', 'staffUsers'],

    add: async function add(data, unfilteredOptions) {
        const saved = await ghostBookshelf.Model.add.call(this, data, unfilteredOptions);
        const creatorId = String(saved.get('created_by') || '').trim();
        if (creatorId) {
            await ghostBookshelf.knex.schema.hasTable('estate_property_staff').then(async (exists) => {
                if (!exists) {
                    return;
                }
                const existing = await ghostBookshelf.knex('estate_property_staff')
                    .where({property_id: saved.id, user_id: creatorId})
                    .first('id');
                if (!existing) {
                    await ghostBookshelf.knex('estate_property_staff').insert({
                        id: ObjectId().toHexString(),
                        property_id: saved.id,
                        user_id: creatorId,
                        role: '登録者',
                        sort_order: 0,
                        is_primary: true,
                        created_at: new Date(),
                        updated_at: new Date()
                    }).catch(() => false);
                }
            }).catch(() => false);
        }
        await upsertEstateSearchIndex(saved.id, unfilteredOptions).catch(() => false);
        await invalidateEstateSearchCache();
        return saved;
    },

    edit: async function edit(data, unfilteredOptions) {
        const saved = await ghostBookshelf.Model.edit.call(this, data, unfilteredOptions);
        await upsertEstateSearchIndex(saved.id, unfilteredOptions).catch(() => false);
        await invalidateEstateSearchCache();
        return saved;
    },

    destroy: function destroy(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'destroy', {extraAllowedProperties: ['id']});
        options.withRelated = ['ghostPosts', 'tags', 'media', 'inquiries', 'staffUsers'];

        const destroyEstateProperty = async () => {
            const property = await this.forge({id: options.id})
                .fetch({
                    ...options,
                    require: false,
                    withRelated: options.withRelated
                });

            if (!property) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            if (String(property.get('status') || '').trim() === 'published') {
                throw new errors.ValidationError({
                    message: tpl(messages.publishedDeleteBlocked)
                });
            }

            const mediaRows = property.related('media') ? property.related('media').toJSON() : [];
            const mediaIds = Array.from(new Set(
                mediaRows
                    .map((row) => String(row.media_id || '').trim())
                    .filter(Boolean)
            ));

            const assets = mediaIds.length > 0
                ? await ghostBookshelf.knex('social_media_assets')
                    .whereIn('id', mediaIds)
                    .select(['id', 'storage_url', 'thumbnail_url'])
                : [];

            if (property.related('ghostPosts')) {
                await property.related('ghostPosts').detach(null, options);
            }
            if (property.related('tags')) {
                await property.related('tags').detach(null, options);
            }
            if (property.related('socialMediaAssets')) {
                await property.related('socialMediaAssets').detach(null, options);
            }
            if (property.related('staffUsers')) {
                await property.related('staffUsers').detach(null, options);
            }

            await ghostBookshelf.knex('estate_inquiries')
                .where({property_id: property.id})
                .transacting(options.transacting)
                .del();

            await ghostBookshelf.knex('estate_property_staff')
                .where({property_id: property.id})
                .transacting(options.transacting)
                .del();

            if (assets.length > 0) {
                await ghostBookshelf.knex('social_media_assets')
                    .whereIn('id', assets.map((asset) => asset.id))
                    .transacting(options.transacting)
                    .del();
            }

            await ghostBookshelf.Model.destroy.call(this, options);
            if (await hasSearchIndexTables(ghostBookshelf.knex)) {
                await ghostBookshelf.knex(ESTATE_SEARCH_INDEX_TABLE).where({property_id: options.id}).transacting(options.transacting).del();
                if (await ghostBookshelf.knex.schema.hasTable(ESTATE_STATION_INDEX_TABLE)) {
                    await ghostBookshelf.knex(ESTATE_STATION_INDEX_TABLE).where({property_id: options.id}).transacting(options.transacting).del();
                }
            }
            await invalidateEstateSearchCache();

            return assets;
        };

        if (!options.transacting) {
            return ghostBookshelf.transaction(async (transacting) => {
                options.transacting = transacting;
                const assets = await destroyEstateProperty();
                await cleanupGalleryFiles(options.id, assets);
                return true;
            });
        }

        return destroyEstateProperty().then(async (assets) => {
            await cleanupGalleryFiles(options.id, assets);
            return true;
        });
    }
});

const EstateProperties = ghostBookshelf.Collection.extend({
    model: EstateProperty
});

module.exports = {
    EstateProperty: ghostBookshelf.model('EstateProperty', EstateProperty),
    EstateProperties: ghostBookshelf.collection('EstateProperties', EstateProperties)
};
