// Everything the painter says, the brushes they reach for, and what the finished piece is called.
import { pick, pickFresh } from './util.js';
import { PIGMENTS } from './schemes.js';

export const LINES = {
  wash: [
    'Let’s put a little color on this canvas and see what shows up.',
    'Thin and wet. Everything moves easier when it’s wet.',
    'Criss-cross, criss-cross. We’re just getting the sky started.',
  ],
  cloud: [
    'That one wants to float. We’ll let it be a cloud.',
    'Same shape as the paint, just fluffier.',
    'A little cloud drifted in. He can stay.',
    'Clouds are free. Take as many as you like.',
    'Scrub it in, soft and loose. Clouds don’t really have edges.',
  ],
  mountain: [
    'Oh, that’s a mountain. You can tell by the way it sits there.',
    'See the top of your splat? That’s the ridge now. We just made it bigger.',
    'Push it up, let it be big. Mountains don’t apologize.',
    'There was a mountain hiding in that one. Same shape and everything.',
  ],
  foothills: ['A few little trees climbing up the hill.', 'Some trees wandered up the mountain. That’s allowed.'],
  mist: ['Let a little mist drift through here. It softens everything.'],
  treeline: [
    'Way back there, a whole row of little trees. They’re far away, so they’re quiet.',
    'Just tap in a distant forest. Nobody has to count them.',
  ],
  evergreen: [
    'There’s a happy little tree in there. Let him grow.',
    'Tap, tap, tap. Let the branches hang however they want.',
    'Trees don’t grow even, and neither should yours.',
    'That drip wanted to be a tree. Who are we to argue.',
  ],
  deciduous: [
    'This one gets leaves. Just dab them on.',
    'A leafy fella. Leave some holes so the birds can get through.',
  ],
  bush: ['Just a little bush. Tap it in and walk away.', 'Push the brush in and let the bristles do the work.'],
  tree: ['There’s a happy little tree in there. Let him grow.'],
  friend: ['He looked lonely, so he got a friend.', 'Everybody needs a neighbor.', 'Let’s give him some company.'],
  family: ['Well, now it’s a whole family.'],
  flowers: ['A few little flowers came up there.', 'Just a dot of color. Leave it alone and it looks like flowers.'],
  cabin: ['Somebody lives here now. A little cabin, nice and cozy.', 'Put a little home in there. Everybody deserves a place to be.'],
  bank: ['This needs some land under it. Let’s make some ground.', 'Pull a little land in from the side. It’s the same shape as your splat.'],
  bankTree: ['He needs somewhere to stand. Land first, then the tree.'],
  island: ['It spilled into an island. Same shape and everything.', 'Out in the middle of the lake, a little island.'],
  islandTree: ['An island, and somebody’s already growing on it.'],
  merge: ['Those two ran together. Now it’s one big thing.', 'Wet into wet. They’re one splat now.'],
  treeSnow: ['Snow found him. He looks good in it.', 'Little bit of snow on the branches. Just tap it on top.'],
  treeGlow: ['The light’s hitting him just right now.', 'Catch the edges with a little warm light.'],
  autumn: {
    default: {
      lines: ['That one turned. Fall came early for him.'],
      you: ['You hit him with some color, so now it’s autumn over there.'],
      auto: ['Some color found him, so now it’s autumn over there.'],
    },
    'autumn-blaze': { lines: ['Even more color over there. He didn’t want to be left out.', 'He was the last one still green. Not anymore.'] },
    'winter-hush': {
      lines: ['Frost turned that one. He’d been holding on to his leaves.'],
      you: ['You hit him with some color, and he turned.'],
      auto: ['Some color found him, and he turned.'],
    },
  },
  company: {
    lines: ['He got bumped, and a friend showed up.'],
    you: ['You hit him, so now he’s got company.'],
    auto: ['Paint found him, so now he’s got company.'],
  },
  snowfall: ['Fresh snow up top. It came down overnight.', 'White on the mountain. It snowed.'],
  waterfall: {
    lines: ['Blue on the mountain? That’s a waterfall now.'],
    you: ['Water found a way down from right where you hit.'],
    auto: ['Water found a way down from right where the paint hit.'],
  },
  alpenglow: {
    evening: ['Now the mountain’s catching the last of the light.', 'Warm up the peaks. That’s the evening hitting them.'],
    morning: ['First light found the peaks. Just warm up the tops.', 'The sun’s barely up, and it’s already on that mountain.'],
    night: ['The moon’s catching the snow up there.', 'A little glow on the peaks. Somebody left the moon on.'],
    default: ['Warm up the peaks. The light’s right on them now.', 'Now the mountain’s catching the light.'],
  },
  sunset: {
    lines: ['Paint on the sun, and the whole sky warms up.'],
    you: ['You touched the sun. Everything goes a little golden.'],
    auto: ['Paint landed on the sun. Everything goes a little golden.'],
  },
  moonGlow: {
    lines: ['Paint on the moon, and the whole sky lights up.'],
    you: ['You touched the moon. Everything goes a little silver.'],
    auto: ['Paint landed on the moon. Everything goes a little silver.'],
  },
  cloudOverSun: ['A little cloud wandered across the sun.'],
  cloudOverMoon: ['A little cloud drifted across the moon.'],
  storm: ['That cloud got heavy. Here comes a little rain.', 'Dark paint on a cloud means weather.'],
  sunlitCloud: ['The edges of that cloud caught the light.'],
  lights: ['Somebody’s home. The lights just came on.', 'Light in the window and smoke in the chimney.'],
  roofSnow: ['Snow on the roof. Cozy in there.'],
  garden: ['They planted a little garden out front.'],
  moss: ['A little moss on the rock.'],
  rockSnow: ['Snow on the rock.'],
  rock: ['A little rock, sitting in the water, minding its own business.', 'Knife it in, touch the top with light. That’s a rock now.'],
  ripples: ['Just a few ripples. The water noticed.', 'A little sparkle on the water.'],
  birds: ['Every little drop that flew off turned into a bird.', 'A couple of birds heard about the view.'],
  stars: ['Look at that. Every drop’s a star.', 'A little spatter up there and the night fills itself in.'],
  sun: ['That’s a sun if I ever saw one.', 'Let’s give this painting some light.'],
  moon: ['The moon’s up. Everybody be quiet now.'],
  aurora: ['The sky’s doing that shimmery thing tonight.'],
  // What a paint turned into, when the color made the call.
  wisp: ['Just a wisp of cloud. Barely there.', 'A little streak of cloud, thin as you like.'],
  goldenCloud: {
    lines: ['Yellow up there, so the cloud’s lit from underneath.'],
    night: ['A cloud with the moon on it. That’s where the yellow went.'],
    default: ['A cloud with the sun on it. That’s where the yellow went.'],
  },
  sunsetCloud: {
    evening: ['Red in the sky makes a sunset cloud.', 'A pink cloud. Somebody’s having a nice evening.'],
    morning: ['Red in the sky, first thing. That’s a sunrise cloud.', 'A pink cloud. Somebody’s up early.'],
    night: ['A rosy cloud, out in the dark. Somebody’s up late.', 'Red up there makes a cloud with a little color left in it.'],
    default: ['Red in the sky makes a rosy cloud.', 'A pink cloud. The afternoon’s getting on.'],
  },
  coolCloud: ['A cool blue cloud. Weather might be on the way.', 'Blue in the sky makes a cool, shady cloud.'],
  stormCloud: ['Dark paint up high? That’s a storm cloud.', 'That one’s heavy. Dark clouds carry weather.'],
  snowyMountain: ['All that white is snow. There was a mountain under it.', 'White, low in the sky. That’s a snowy peak.'],
  blueMountain: ['Blue mountains, way off. Distance turns everything blue.', 'A blue ridge. Far away and quiet.'],
  brownMountain: ['Brown, low in the sky. That’s rock. A big old mountain.', 'Van Dyke Brown makes good solid rock.'],
  redMountain: {
    lines: ['Red rock. It glows like that out west.'],
    evening: ['A red mountain. The evening sun lives in there.'],
    morning: ['A red mountain. Wait till the sun gets on it.'],
    night: ['Red rock, cooling off in the dark.'],
    default: ['A red mountain. The sun lives in there.'],
  },
  goldMountain: {
    night: ['Ochre makes a pale mountain. Sandstone, maybe, under the moon.'],
    default: ['Ochre makes a sunny mountain. Sandstone, maybe.'],
  },
  greenMountain: ['A green mountain, trees all the way up.', 'Green that high up is a forested hill.'],
  tallTree: ['Green way up there? That’s the top of a tall tree.', 'A tall one. He grew right up to where the paint landed.'],
  snowyTreeline: ['A row of snowy trees, way off.'],
  blueSpruce: ['Blue paint on the ground makes a blue spruce.', 'A little blue spruce. They’re real, you know.'],
  birch: ['White on the ground? A birch. White bark, dark marks.', 'A birch tree. The white paint went into the bark.'],
  snowyTree: ['White on the land. A tree that’s been out in the snow.', 'That white’s snow. There’s a tree under it.'],
  goldenTree: ['Yellow on the ground turns into a golden tree.', 'A golden fella. The yellow went into the leaves.'],
  redTree: ['A red one. Maples do that.', 'Red paint on the land makes a red tree.'],
  bareTree: ['Brown makes a bare tree. Just branches. He’s resting.', 'No leaves on this one. Brown paint, bare branches.'],
  redCabin: ['Red on the land? A little red cabin.', 'Somebody painted their cabin red. Good for them.'],
  whiteCabin: ['A little white house. Somebody keeps it nice.'],
  sailboat: ['White on the water is a sail. Somebody’s out on the lake.', 'A little sailboat. The white paint caught the wind.'],
  canoe: ['Red on the water. That’s a canoe.', 'A red canoe, just drifting. Nobody’s in a hurry.'],
  glints: ['Light on the water. That’s where the paint went.', 'A little sparkle where the light hits the lake.'],
  blueRipples: ['Blue on the water just moves the water around.', 'A few ripples, cool and blue.'],
  signature: [
    'Now sign it. That makes it yours.',
    'A little red, down in the corner. That makes it yours.',
    'Sign it small, in the corner. Good paintings don’t shout.',
  ],
  hung: [
    'It’s on the wall. Paint on if you like, or start a fresh one.',
    'That one’s hanging now. There’s always more paint.',
    'Up on the wall it goes. The easel’s still here if you want it.',
  ],
  invite: ['Your turn. Tap, flick, or press and hold. Try hitting what’s already there, too.'],
  done: [
    'That might be done. Sign it whenever you’re ready.',
    'Let’s step back and look at it. I think it’s done.',
    'I wouldn’t touch it again. Sign it when you’re ready.',
    'It’s found what it wanted to be. Sign it, or keep going.',
  ],
  undo: ['There’s no undo in here. Let’s see what it turns into instead.'],
  leave: ['That one landed off the canvas. Happens to everybody.'],
};

const TOOLS = {
  wash: ['2-inch brush', ['Liquid White', 'Phthalo Blue', 'Alizarin Crimson']],
  cloud: ['1-inch brush', ['Titanium White', 'a whisper of Alizarin Crimson']],
  mountain: ['Palette knife', ['Van Dyke Brown', 'Prussian Blue', 'Titanium White']],
  foothills: ['Fan brush', ['Sap Green', 'Liquid White']],
  mist: ['2-inch brush', ['Liquid White']],
  treeline: ['Fan brush', ['Sap Green', 'Midnight Black']],
  evergreen: ['Fan brush', ['Midnight Black', 'Sap Green', 'Cadmium Yellow']],
  deciduous: ['Round brush', ['Sap Green', 'Yellow Ochre', 'Van Dyke Brown']],
  bush: ['1-inch brush', ['Sap Green', 'Cadmium Yellow']],
  flowers: ['Liner brush', ['Bright Red', 'Cadmium Yellow']],
  cabin: ['Palette knife', ['Van Dyke Brown', 'Dark Sienna', 'Titanium White']],
  bank: ['2-inch brush', ['Van Dyke Brown', 'Sap Green', 'Yellow Ochre']],
  rock: ['Palette knife', ['Van Dyke Brown', 'Titanium White']],
  ripples: ['Liner brush', ['Titanium White']],
  birds: ['Liner brush', ['Midnight Black']],
  stars: ['Liner brush', ['Titanium White']],
  sun: ['1-inch brush', ['Cadmium Yellow', 'Titanium White']],
  moon: ['1-inch brush', ['Titanium White', 'Prussian Blue']],
  aurora: ['2-inch brush', ['Phthalo Green', 'Titanium White']],
  signature: ['Liner brush', ['Bright Red']],
  sailboat: ['Liner brush', ['Titanium White', 'Van Dyke Brown']],
  canoe: ['Palette knife', ['Bright Red', 'Van Dyke Brown']],
  glints: ['Liner brush', ['Cadmium Yellow', 'Titanium White']],
  island: ['2-inch brush', ['Van Dyke Brown', 'Sap Green', 'Yellow Ochre']],
  treeSnow: ['Fan brush', ['Titanium White']],
  treeGlow: ['Fan brush', ['Cadmium Yellow', 'Titanium White']],
  autumn: ['Round brush', ['Bright Red', 'Indian Yellow', 'Yellow Ochre']],
  snowfall: ['Palette knife', ['Titanium White']],
  waterfall: ['Liner brush', ['Titanium White', 'Phthalo Blue']],
  alpenglow: ['Palette knife', ['Alizarin Crimson', 'Titanium White']],
  sunset: ['2-inch brush', ['Cadmium Yellow', 'Alizarin Crimson']],
  storm: ['1-inch brush', ['Midnight Black', 'Prussian Blue']],
  rain: ['Fan brush', ['Liquid White']],
  sunlitCloud: ['1-inch brush', ['Cadmium Yellow', 'Titanium White']],
  lights: ['Liner brush', ['Cadmium Yellow', 'Indian Yellow']],
  roofSnow: ['Palette knife', ['Titanium White']],
  moss: ['Fan brush', ['Sap Green']],
  rockSnow: ['Palette knife', ['Titanium White']],
};

// The time of day each mood paints, for lines that only fit some of them.
const TIME = { 'golden-hour': 'evening', 'violet-dusk': 'evening', 'misty-morning': 'morning', 'winter-hush': 'morning', 'northern-night': 'night', 'autumn-blaze': 'day' };

// Everything the painter might say for a key, in a mood (scheme, a mood's id) and for paint thrown by someone or by the
// toy itself (auto: Oops, Let it happen and the intro). A key's lines are a list, or { lines, you, auto, and lines for
// a mood or a time of day, falling back to default }, where each of those is the same again or a list.
export function linesFor(key, { scheme, auto = false } = {}) {
  const pool = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    const timed = v[scheme] ?? v[TIME[scheme]] ?? v.default;
    return [...(v.lines || []), ...((auto ? v.auto : v.you) || []), ...pool(timed)];
  };
  return pool(LINES[key]);
}

export function line(key, ctx) {
  return pickFresh(key, linesFor(key, ctx));
}

// Paints ran together into a new color. Two are named; three or more are counted, so the line stays short.
export function mixLine(names, color) {
  const many = names.length > 2;
  const list = many ? `${num(names.length)} paints` : names.join(' and ');
  const List = list[0].toUpperCase() + list.slice(1);
  return pickFresh('mix', [
    `${List} ran together. That’s ${color} now.`,
    `${List} make ${color}. Let’s see what it wants to be.`,
    `Wet into wet: ${list}. Now it’s ${color}.`,
  ]);
}

// The family of each paint the painter names, for the ones that aren't on the palette too.
const FAMILY = { ...Object.fromEntries(PIGMENTS.map((p) => [p.name, p.family])), 'Liquid White': 'white', 'Midnight Black': 'black', 'Dark Sienna': 'brown', 'Phthalo Green': 'green' };
const HUES = new Set(['yellow', 'red', 'green', 'blue']);
const familyIn = (name) => FAMILY[Object.keys(FAMILY).find((n) => name.includes(n))];

// The brush and paints for a kind of thing, and a touch of the splat's own paint when they don't already name it. A
// paint of another hue than the splat's is left out (a blue cloud gets no whisper of crimson); when that leaves none,
// the splat's paint is the one named.
export function toolInfo(kind, pigment) {
  const t = TOOLS[kind];
  if (!t) return '';
  const [tool, all] = t;
  const clashes = (name) => pigment && HUES.has(pigment.family) && HUES.has(familyIn(name)) && familyIn(name) !== pigment.family;
  const paints = all.filter((name) => !clashes(name));
  if (!paints.length) return `${tool} · ${pigment.name}`;
  let text = `${tool} · ${paints.join(', ')}`;
  if (pigment && !paints.some((name) => name.includes(pigment.name))) text += ` · a touch of ${pigment.name}`;
  return text;
}

// ——— Titles ———

const PLACE_A = ['Hollow', 'Cedar', 'Otter', 'Wren', 'Bramble', 'Silver', 'Miller’s', 'Juniper', 'Heron', 'Quiet', 'Lantern', 'Foxglove', 'Birch', 'Stillwater', 'Old Mill', 'Kestrel'];
const PLACE_B = ['Creek', 'Lake', 'Cove', 'Pond', 'Hollow', 'Reach', 'Bend', 'Ridge', 'Meadow', 'Crossing', 'Narrows', 'Point'];

const MOOD = {
  'golden-hour': { adj: ['Golden', 'Late', 'Amber', 'Warm'], time: ['Late Afternoon', 'Sundown', 'Golden Hour'] },
  'winter-hush': { adj: ['Quiet', 'Frozen', 'Hushed', 'Silver'], time: ['First Snow', 'Deep Winter', 'A Cold Morning'] },
  'northern-night': { adj: ['Midnight', 'Starlit', 'Northern', 'Sleeping'], time: ['Midnight', 'Moonrise', 'The Long Night'] },
  'autumn-blaze': { adj: ['October', 'Copper', 'Blazing', 'Russet'], time: ['Early October', 'Harvest Time', 'The Turning'] },
  'misty-morning': { adj: ['Misty', 'Soft', 'Early', 'Gentle'], time: ['Early Morning', 'First Light', 'Morning Fog'] },
  'violet-dusk': { adj: ['Violet', 'Evening', 'Dusky', 'Lavender'], time: ['Dusk', 'Last Light', 'Nightfall'] },
};

function subjects(counts) {
  const s = [];
  if (counts.cabin) s.push(['Cabin', 'Cabins'], ['Hideaway', 'Hideaways'], ['Homestead', 'Homesteads']);
  if (counts.mountain) s.push(['Peak', 'Peaks'], ['Ridge', 'Ridges'], ['Mountain', 'Mountains']);
  if (counts.evergreen) s.push(['Pine', 'Pines'], ['Evergreen', 'Evergreens']);
  if (counts.deciduous || counts.bush) s.push(['Grove', 'Groves'], ['Thicket', 'Thickets']);
  if (counts.rock) s.push(['Stone', 'Stones']);
  if (counts.island) s.push(['Island', 'Islands']);
  if (counts.waterfall) s.push(['Falls', 'Falls']);
  if (counts.sailboat) s.push(['Sail', 'Sails']);
  if (counts.canoe) s.push(['Canoe', 'Canoes']);
  if (counts.moon || counts.stars) s.push(['Moon', 'Moons']);
  if (!s.length) s.push(['Water', 'Waters'], ['Sky', 'Skies'], ['Shore', 'Shores']);
  return s;
}

export function makeTitle(counts, schemeId) {
  const mood = MOOD[schemeId] || MOOD['golden-hour'];
  const place = `${pick(PLACE_A)} ${pick(PLACE_B)}`.replace('Hollow Hollow', 'Hollow Creek');
  const [one, many] = pick(subjects(counts));
  const adj = pick(mood.adj);
  const templates = [
    () => `${adj} ${many}`,
    () => `${one} at ${place}`,
    () => `${pick(mood.time)} at ${place}`,
    () => `The ${adj} ${one}`,
    () => `Where the ${many} Are`,
    () => `${place}, ${pick(mood.time)}`,
    () => `${adj} Morning at ${place}`.replace(/(Midnight|Evening) Morning/, '$1').replace(/(Dusky|Violet|Starlit|Sleeping|Northern) Morning/, '$1 Night'),
  ];
  return pick(templates)();
}

// ——— Placard text ———

const FEATURE_NAMES = [
  ['mountain', 'a mountain', 'mountains'],
  ['evergreen', 'a happy little tree', 'happy little trees'],
  ['deciduous', 'a leafy tree', 'leafy trees'],
  ['bush', 'a bush', 'bushes'],
  ['cabin', 'a cabin', 'cabins'],
  ['cloud', 'a cloud', 'clouds'],
  ['rock', 'a rock', 'rocks'],
  ['birds', 'a pair of birds', 'flocks of birds'],
  ['flowers', 'some flowers', 'patches of flowers'],
  ['bank', 'a bit of shore', 'stretches of shore'],
  ['island', 'an island', 'islands'],
  ['sailboat', 'a sailboat', 'sailboats'],
  ['canoe', 'a canoe', 'canoes'],
  ['waterfall', 'a waterfall', 'waterfalls'],
  ['rain', 'a passing rainstorm', 'passing rainstorms'],
  ['treeline', 'a distant forest', 'distant forests'],
];

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n) => WORDS[n] || String(n);

// Under the label, when the browser wouldn't keep the painting, or kept it by taking older ones down beyond the usual
// 12th. Empty when all went as usual.
export function keptNote({ kept, dropped }, canSave = true) {
  if (!kept) return `This browser isn’t keeping paintings, so this one won’t go up on the wall. ${canSave ? 'Download it to keep it.' : 'Save the picture to keep it.'}`;
  if (dropped === 1) return 'The browser ran short of room, so the oldest painting came down to make space for this one.';
  if (dropped > 1) return `The browser ran short of room, so the ${num(dropped)} oldest paintings came down to make space for this one.`;
  return '';
}

export function featureLine(counts) {
  const parts = [];
  for (const [key, one, many] of FEATURE_NAMES) {
    const n = counts[key] || 0;
    if (!n) continue;
    parts.push(n === 1 ? one : `${num(n)} ${many}`);
  }
  if (counts.sun) parts.push('the sun');
  if (counts.moon) parts.push('the moon');
  if (counts.aurora) parts.push('an aurora');
  if (!parts.length) return 'Mostly sky and water, which is plenty.';
  if (parts.length === 1) return `Features ${parts[0]}.`;
  if (parts.length > 6) return `Features ${parts.slice(0, 5).join(', ')}, and more.`;
  const last = parts.pop();
  return `Features ${parts.join(', ')} and ${last}.`;
}

export function durationText(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} seconds`;
  return `${m} min ${s} s`;
}

export function madeFrom(accidents, seconds) {
  if (!accidents) return `Painted wet-on-wet without a single accident, in ${durationText(seconds)}.`;
  const a = accidents === 1 ? 'one happy accident' : `${accidents} happy accidents`;
  return `Painted wet-on-wet from ${a} in ${durationText(seconds)}.`;
}

