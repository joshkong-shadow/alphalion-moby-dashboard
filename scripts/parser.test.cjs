const { test } = require('node:test');
const assert = require('node:assert');
require(__dirname + '/../js/parser.js');
const { parseAdName, parseCampaignName } = globalThis.MobyParser;

test('canonical 12-segment', () => {
  const p = parseAdName('B2O | Fat Loss | Body Transformation | Be Careful Zach | UGC | b2o-vv108.v60 | Dave | Sebastian | Ai | B2O-LP11 | FP-ZachSale | 02.09.26');
  assert.equal(p.conformity, 'canonical');
  assert.equal(p.funnel, 'B2O');
  assert.equal(p.concept, 'Fat Loss');
  assert.equal(p.angle, 'Body Transformation');
  assert.equal(p.format, 'UGC');
  assert.equal(p.mediaType, 'video');
  assert.equal(p.lander, 'B2O-LP11');
  assert.equal(p.fanPage, 'FP-ZachSale');
  assert.equal(p.launchDate, '2026-09-02');
});
test('image media type + dotted ad id', () => {
  const p = parseAdName('B2O | Fat Loss | Carnitine | Caught At Gym Parking Lot | AI Character | b2o.ach-vv4.v1 | Dennis | ACH | AI gen | B2O-LP01 | FP-AL | 15.09.26');
  assert.equal(p.conformity, 'canonical');
  assert.equal(p.mediaType, 'video');
  const q = parseAdName('SHT | Body Transformation | Testo Signals | Hook | Fmt | sht-img113.v3 | Dave | Nacho | Christian | SHT-LIST10 | FP-AL | 19.08.26');
  assert.equal(q.mediaType, 'image');
});
test('fan page alias without FP prefix', () => {
  const p = parseAdName('B2O | Fat Loss | Fat Burning Energy | Best Sweats | Thumbstopper | b2o-vv06.v10 | Nacho | Nacho | Stock | B2O-LIST10 | WLW | 09.09.26');
  assert.equal(p.conformity, 'canonical');
  assert.equal(p.fanPage, 'FP-WLW');
});
test('empty strategist tolerated', () => {
  const p = parseAdName('SHT | Body Transformation | Testo Signals | Stop Guessing What To Take | n/a | sht-img113.v3 | | Nacho | Christian | SHT-LIST10 | FP-AL | 19.08.26');
  assert.equal(p.conformity, 'canonical');
  assert.equal(p.strategist, 'n/a');
});
test('11-segment, date, no fan page', () => {
  const p = parseAdName('B2O | Fat Loss | Fat Burning Energy | Broad Messaging Test | Product Image | b2o-img58.v2 | Dave | Kevin | n/a | B2O-LIST10 | 03.09.26');
  assert.equal(p.conformity, 'canonical');
  assert.equal(p.fanPage, null);
  assert.equal(p.launchDate, '2026-09-03');
});
test('trybe placeholder -> creator + date recovered', () => {
  const p = parseAdName('B2O | Concept | Angle | UGC | Trybe | Ad ID | Trybe | Trybe | Trybe | Lander | FP- | Date | ChristopherBauder_BURN2O_20260915_/trybe=c5b86586');
  assert.equal(p.conformity, 'trybe');
  assert.equal(p.creator, 'ChristopherBauder');
  assert.equal(p.launchDate, '2026-09-15');
});
test('legacy 9-segment -> unknown', () => {
  const p = parseAdName('B2O | b2o-vv401.v20 | Fat Visuals | Nacho | Nacho | Troy | B2O-LP01 | FP-AL | 06.07 [THF]');
  assert.equal(p.conformity, 'unknown');
  assert.equal(p.funnel, 'B2O');
});
test('extra trailing tags ignored', () => {
  const p = parseAdName('B2O | Fat Loss | X | Y | UGC | b2o-vv1.v1 | A | B | C | B2O-LP01 | FP-AL | 02.09.26 | [EXTRA] | more');
  assert.equal(p.conformity, 'canonical');
  assert.deepEqual(p.extras, ['[EXTRA]', 'more']);
});
test('campaign parse + testing flag', () => {
  const c = parseCampaignName('DEL | US | ABO | Auto  | Testing W38 | 14.09.26');
  assert.equal(c.funnel, 'DEL');
  assert.equal(c.isTesting, true);
  const s = parseCampaignName('B2O | US | ABO | CC | Scaling | 05.21');
  assert.equal(s.isTesting, false);
});
