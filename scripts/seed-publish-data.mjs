/**
 * Seed publish_posts test data for all 5 content types.
 *
 * Usage: node scripts/seed-publish-data.mjs
 *
 * Requires:
 * - Ghost running at http://localhost:2368
 * - GHOST_ADMIN_API_KEY env var (format: {id}:{secret})
 * - Or defaults to the dev API key from .env.development
 */

import { createHmac } from 'node:crypto';

const API_KEY = process.env.GHOST_ADMIN_API_KEY || '690f295d4cde39000178a2cd:079ef55148f0a556eeb0c67d041b91003554907668bf53fcec4985fba06f4971';
const GHOST_URL = process.env.GHOST_URL || 'http://localhost:2368';

// Generate Ghost Admin API JWT
function generateGhostToken(key) {
  const [id, secret] = key.split(':');
  if (!id || !secret) throw new Error('Invalid API key format');

  const header = { alg: 'HS256', typ: 'JWT', kid: id };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + 300,
    aud: '/admin/'
  };

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64(header);
  const p = b64(payload);
  const sig = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${h}.${p}`).digest('base64url');

  return `${h}.${p}.${sig}`;
}

const TOKEN = generateGhostToken(API_KEY);

async function api(method, path, body) {
  const url = `${GHOST_URL}/ghost/api/admin${path}`;
  const headers = {
    'Authorization': `Ghost ${TOKEN}`,
    'Content-Type': 'application/json',
    'Accept-Version': 'v5.116'
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`  ${method} ${path} failed (${res.status}):`, JSON.stringify(data.errors || data).slice(0, 200));
    return null;
  }
  return data;
}

// ── Test data ────────────────────────────────────────────────────────

const SAMPLE_POSTS = {
  news: [
    {
      title: 'Global Summit Concludes with Historic Climate Agreement',
      html: '<p>In a landmark moment for international cooperation, leaders from 195 nations have signed the most comprehensive climate agreement in history.</p><p>The accord commits signatories to a 60% reduction in carbon emissions by 2040.</p>',
      excerpt: 'World leaders reach landmark accord on emissions reductions, pledging $500 billion in green technology investments.',
      tags: ['climate', 'summit', 'environment'],
      status: 'published',
      feature_image: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&h=400&fit=crop',
      content_type: 'news',
      section: 'International',
      featured: true,
      metadata_json: { source: 'Associated Press', breaking: true, deck: 'World leaders pledge $500B in green investments' }
    },
    {
      title: 'New Environmental Regulations Take Effect This Month',
      html: '<p>Stricter emissions standards for industries begin implementation across all sectors, with a focus on manufacturing and transportation.</p>',
      excerpt: 'Stricter emissions standards target manufacturing and transportation sectors.',
      tags: ['environment', 'regulation', 'politics'],
      status: 'published',
      content_type: 'news',
      section: 'Politics',
      featured: false,
      metadata_json: { source: 'Policy Desk', breaking: false }
    },
    {
      title: 'City Council Approves 2027 Budget with Focus on Infrastructure',
      html: '<p>The city council voted 12-3 to approve the $5.2 billion budget, allocating record funding to public transportation, road repairs, and green energy initiatives.</p>',
      excerpt: '$5.2 billion budget allocates record funding to transit and green energy.',
      tags: ['budget', 'politics', 'infrastructure'],
      status: 'published',
      content_type: 'news',
      section: 'Politics',
      featured: false,
      metadata_json: { source: 'City Press' }
    },
    {
      title: 'Nikkei Index Closes 2.3% Higher on Tech Rally',
      html: '<p>Japanese stocks surged to a three-month high as technology shares led broad gains, with semiconductor and AI-related companies posting strong results.</p>',
      excerpt: 'Japanese stocks hit three-month high led by semiconductor and AI shares.',
      tags: ['markets', 'economy', 'tech'],
      status: 'published',
      content_type: 'news',
      section: 'Economy',
      metadata_json: { source: 'Market Desk' }
    },
    {
      title: 'Cultural Heritage Sites Receive UNESCO Recognition',
      html: '<p>Five new sites across Japan have been added to the UNESCO World Heritage list, recognizing the country\'s rich cultural and natural heritage.</p>',
      excerpt: 'Five new Japanese sites added to UNESCO World Heritage list.',
      tags: ['culture', 'heritage', 'unesco'],
      status: 'published',
      content_type: 'news',
      section: 'Culture',
      metadata_json: { source: 'Cultural Desk' }
    }
  ],
  government: [
    {
      title: '2026 Annual Budget Report',
      html: '<p>Comprehensive annual budget breakdown including revenue projections and expenditure allocations for the fiscal year 2026.</p>',
      excerpt: 'Comprehensive annual budget breakdown including revenue projections.',
      tags: ['budget', 'government', 'finance'],
      status: 'published',
      content_type: 'government',
      section: 'Budget',
      featured: true,
      metadata_json: { issuingAuthority: 'City Finance Department', documentType: 'PDF', fileSize: '2.4 MB', urgent: false }
    },
    {
      title: 'Emergency Evacuation Procedures Update',
      html: '<p>Updated evacuation routes and emergency procedures for all districts. All residents should review the new guidelines.</p>',
      excerpt: 'Updated evacuation routes and emergency procedures for all districts.',
      tags: ['emergency', 'safety', 'government'],
      status: 'published',
      content_type: 'government',
      section: 'Public Safety',
      metadata_json: { issuingAuthority: 'Public Safety Office', documentType: 'PDF', fileSize: '1.2 MB', urgent: true }
    }
  ],
  publication: [
    {
      title: 'The Great Adventure',
      html: '<p>An epic journey through uncharted territories. Follow our hero as they discover hidden civilizations and face impossible odds.</p>',
      excerpt: 'An epic journey through uncharted territories.',
      tags: ['fiction', 'adventure', 'bestseller'],
      status: 'published',
      feature_image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=300&fit=crop',
      content_type: 'publication',
      section: 'Fiction',
      metadata_json: { publisher: 'Chronicle Books', format: 'hardcover', price: '$24.99', isbn: '978-0-123456-78-9', pageCount: 320, rating: 4.5 }
    },
    {
      title: 'Digital Horizons',
      html: '<p>A deep dive into how digital transformation is reshaping industries from healthcare to finance.</p>',
      excerpt: 'How digital transformation is reshaping industries worldwide.',
      tags: ['non-fiction', 'technology', 'digital'],
      status: 'published',
      content_type: 'publication',
      section: 'Non-Fiction',
      metadata_json: { publisher: 'Tech Press', format: 'paperback', price: '$18.99', isbn: '978-0-987654-32-1', pageCount: 280 }
    }
  ],
  comic: [
    {
      title: 'Dragon Saga — Ch. 47: The Final Trial',
      html: '<p>The epic conclusion to the Dragon Saga arc. Our hero faces the ancient dragon in a battle that will decide the fate of the realm.</p>',
      excerpt: 'The epic conclusion to the Dragon Saga arc.',
      tags: ['manga', 'fantasy', 'dragon-saga'],
      status: 'published',
      feature_image: 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=400&h=300&fit=crop',
      content_type: 'comic',
      section: 'Shonen',
      metadata_json: { seriesName: 'Dragon Saga', chapterNumber: 47, totalChapters: 100, readingDirection: 'rtl' }
    },
    {
      title: 'Shadow Realm — Ch. 32: Into the Abyss',
      html: '<p>The heroes descend into the Shadow Realm, facing nightmarish creatures and uncovering dark secrets about their world.</p>',
      excerpt: 'The heroes descend into the Shadow Realm.',
      tags: ['manga', 'dark-fantasy', 'shadow-realm'],
      status: 'published',
      content_type: 'comic',
      section: 'Seinen',
      metadata_json: { seriesName: 'Shadow Realm', chapterNumber: 32, totalChapters: 60, readingDirection: 'rtl' }
    }
  ],
  entertainment: [
    {
      title: 'Summer Music Festival 2026',
      html: '<p>Three-day outdoor music festival featuring top international artists across 5 stages. Early bird tickets available now.</p>',
      excerpt: 'Three-day outdoor music festival featuring top international artists.',
      tags: ['music', 'festival', 'summer'],
      status: 'published',
      feature_image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=400&fit=crop',
      content_type: 'entertainment',
      section: 'Music',
      featured: true,
      metadata_json: { startDate: '2026-07-15', endDate: '2026-07-17', location: 'Central Park, New York', priceRange: '$150', ticketUrl: 'https://tickets.example.com' }
    },
    {
      title: 'Art Exhibition: Contemporary Visions',
      html: '<p>Featuring works from 50 emerging and established contemporary artists from across Asia.</p>',
      excerpt: 'Featuring works from 50 contemporary artists from across Asia.',
      tags: ['art', 'exhibition', 'culture'],
      status: 'published',
      content_type: 'entertainment',
      section: 'Art',
      metadata_json: { startDate: '2026-07-01', endDate: '2026-08-30', location: 'City Gallery, Tokyo', priceRange: '$12' }
    },
    {
      title: 'International Jazz Night',
      html: '<p>An evening of world-class jazz performances featuring award-winning musicians from five continents.</p>',
      excerpt: 'World-class jazz performances from five continents.',
      tags: ['jazz', 'music', 'night'],
      status: 'published',
      content_type: 'entertainment',
      section: 'Music',
      metadata_json: { startDate: '2026-07-05', endDate: '2026-07-05', location: 'Blue Note Club', priceRange: '$45' }
    }
  ]
};

async function main() {
  console.log('Seeding publish_posts test data...\n');
  console.log(`Ghost URL: ${GHOST_URL}`);

  let total = 0;
  for (const [type, posts] of Object.entries(SAMPLE_POSTS)) {
    console.log(`\n--- ${type} (${posts.length} items) ---`);
    for (const post of posts) {
      const { content_type, section, featured, metadata_json, metadata, ...postData } = post;
      const payload = {
        publishcontent: [{
          ...postData,
          content_type,
          section,
          featured,
          metadata_json,
          status: postData.status || 'draft',
          published_at: new Date().toISOString()
        }]
      };

      console.log(`  Creating: ${post.title.slice(0, 50)}...`);
      const result = await api('POST', '/publish/content', payload);
      if (result) {
        const id = result.publishContent?.[0]?.id || result.id;
        console.log(`  ✅ Created (id: ${id})`);
        total++;
      } else {
        console.log(`  ❌ Failed`);
      }
    }
  }

  console.log(`\n--- Done: ${total} items created ---`);
}

main().catch(console.error);
