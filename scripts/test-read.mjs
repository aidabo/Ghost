import { createHmac } from 'node:crypto';

const KEY = '690f295d4cde39000178a2cd:079ef55148f0a556eeb0c67d041b91003554907668bf53fcec4985fba06f4971';
const [id, secret] = KEY.split(':');
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b({ alg: 'HS256', typ: 'JWT', kid: id });
const p = b({ iat: ~~(Date.now() / 1e3), exp: ~~(Date.now() / 1e3) + 300, aud: '/admin/' });
const token = h + '.' + p + '.' + createHmac('sha256', Buffer.from(secret, 'hex')).update(h + '.' + p).digest('base64url');

const res = await fetch('http://localhost:2368/ghost/api/admin/publish/content?limit=2', {
  headers: { 'Authorization': `Ghost ${token}`, 'Accept-Version': 'v5.116' }
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
