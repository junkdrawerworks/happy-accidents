// Everything the painter says, the brushes they reach for, and what the finished piece is called.
import { pick, pickFresh, weighted } from './util.js';
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
    'A soft one, drifting. Nowhere to be.',
    'Push it around a little. Clouds aren’t fussy.',
    'Another cloud. The sky’s got room.',
    'Light on top, a little grey underneath. That’s all a cloud is.',
    'That one came in on the wind. Let it stay a while.',
    'Keep it loose. A cloud that tries too hard looks like a sheep.',
    'Clouds are mostly air. Go easy on it.',
  ],
  mountain: {
    lines: [
      'Oh, that’s a mountain. You can tell by the way it sits there.',
      'Push it up, let it be big. Mountains don’t apologize.',
      'There was a mountain hiding in that one. Same shape and everything.',
    ],
    // The intro's mountain, and Oops's and Let it happen's, weren't anybody's splat.
    you: ['See the top of your splat? That’s the ridge now. We just made it bigger.'],
  },
  foothills: [
    'A few little trees climbing up the hill.',
    'Some trees wandered up the mountain. That’s allowed.',
    'Trees on the slope. They like it up there.',
    'A few trees on the mountainside. Somebody’s been planting.',
    'Just tap a few trees up the side. They’ll find their footing.',
  ],
  mist: [
    'Let a little mist drift through here. It softens everything.',
    'A little fog settled in down there. Leave it soft.',
    'Mist at the foot of the mountain. It keeps a secret or two.',
  ],
  treeline: [
    'Way back there, a whole row of little trees. They’re far away, so they’re quiet.',
    'Just tap in a distant forest. Nobody has to count them.',
    'A row of trees on the far shore. Just a suggestion of them.',
  ],
  evergreen: [
    'There’s a happy little tree in there. Let him grow.',
    'Tap, tap, tap. Let the branches hang however they want.',
    'Trees don’t grow even, and neither should yours.',
    'That drip wanted to be a tree. Who are we to argue.',
    'A pine. Start at the top and let him get wider as he goes.',
    'Dark green, a little ragged. That’s how pines like it.',
    'A tall, quiet pine. He’s been here a while.',
  ],
  deciduous: [
    'This one gets leaves. Just dab them on.',
    'A leafy fella. Leave some holes so the birds can get through.',
    'A round little tree. Let the light hit one side of him.',
  ],
  bush: [
    'Just a little bush. Tap it in and walk away.',
    'Push the brush in and let the bristles do the work.',
    'A little bush to keep the ground company.',
  ],
  friend: [
    'He looked lonely, so he got a friend.',
    'Everybody needs a neighbor.',
    'Let’s give him some company.',
    'Another one, right next to him. Trees like to stand together.',
    'Now there’s two of them. Nobody has to stand out there alone.',
    'A friend came up beside him. Same paint, same ground.',
  ],
  family: [
    'Well, now it’s a whole family.',
    'A whole little grove now. They’re all related.',
    'One on each side. That’s a family.',
    'More trees showed up. Word gets around.',
  ],
  flowers: [
    'A few little flowers came up there.',
    'Just a dot of color. Leave it alone and it looks like flowers.',
    'Some color down in the grass. They’re wildflowers now.',
  ],
  cabin: [
    'Somebody lives here now. A little cabin, nice and cozy.',
    'Put a little home in there. Everybody deserves a place to be.',
    'A cabin. Somebody’s got a good view from that porch.',
  ],
  bank: {
    lines: [
      'Let’s give the lake an edge over here.',
      'A little shore. Somewhere for things to stand.',
      'Land, the same shape as the paint. Pull it right down to the water.',
    ],
    // Only for your own bank: the intro's comes before anyone has had a turn.
    you: ['Pull a little land in from the side. It’s the same shape as your splat.', 'Some ground to stand on. Hit it again and see what grows.'],
    auto: ['Pull a little land in from the side. Something might come up on it.'],
  },
  bankTree: ['He needs somewhere to stand. Land first, then the tree.'],
  island: [
    'It spilled into an island. Same shape and everything.',
    'Out in the middle of the lake, a little island.',
    'Land out in the water. Somebody could row out to that.',
  ],
  islandTree: [
    'An island, and somebody’s already growing on it.',
    'A little island with a tree on it. He’s got the place to himself.',
    'Out on the water, some land, and a tree to keep it company.',
  ],
  merge: [
    'Those two ran together. Now it’s one big thing.',
    'Wet into wet. They’re one splat now.',
    'Still wet, so they ran together. That’s how paint is.',
    'They touched while they were wet. Now they’re one.',
    'Two splats, one puddle. We’ll see what it wants to be.',
  ],
  treeSnow: [
    'Snow found him. He looks good in it.',
    'Little bit of snow on the branches. Just tap it on top.',
    'White on a tree? That’s snow on the branches.',
    'He caught some snow. Let it sit on top.',
  ],
  treeGlow: [
    'The light’s hitting him just right now.',
    'Catch the edges with a little warm light.',
    'Warm light on one side. He’s facing the right way.',
    'Just touch the edges. The light does the rest.',
  ],
  autumn: {
    default: {
      lines: ['That one turned. Fall came early for him.', 'Red and gold on that one now. He turned overnight.'],
      you: ['You hit him with some color, so now it’s autumn over there.'],
      auto: ['Some color found him, so now it’s autumn over there.'],
    },
    'autumn-blaze': {
      lines: ['Even more color over there. He didn’t want to be left out.', 'He was the last one still green. Not anymore.', 'One more in color. Everybody’s doing it this year.'],
    },
    'winter-hush': {
      lines: ['Frost turned that one. He’d been holding on to his leaves.', 'A little late color, right there in the snow. He wears it well.'],
      you: ['You hit him with some color, and he turned.'],
      auto: ['Some color found him, and he turned.'],
    },
  },
  company: {
    lines: [
      'He got bumped, and a friend showed up.',
      'Paint on a tree makes another tree. That’s just how it works in here.',
      'Somebody new came up next to him.',
      'Bump a tree and there’s two of them.',
      'A little company came up beside him.',
      'Trees don’t much like standing alone. Now he doesn’t have to.',
      'Some paint landed on him, and now he’s got a neighbor.',
      'There was room for one more, right next to him.',
    ],
    you: ['You hit him, so now he’s got company.'],
    auto: ['Paint found him, so now he’s got company.'],
  },
  snowfall: [
    'Fresh snow up top. It came down overnight.',
    'White on the mountain. It snowed.',
    'Snow on the peaks. It’s cold up there.',
    'A fresh coat of white up top. Leave the rest alone.',
  ],
  waterfall: {
    lines: ['Blue on the mountain? That’s a waterfall now.', 'Water coming down the rocks. Just a few streaks.'],
    you: ['Water found a way down from right where you hit.'],
    auto: ['Water found a way down from right where the paint hit.'],
  },
  alpenglow: {
    evening: ['Now the mountain’s catching the last of the light.', 'Warm up the peaks. That’s the evening hitting them.', 'The peaks go pink right before dark.'],
    morning: ['First light found the peaks. Just warm up the tops.', 'The sun’s barely up, and it’s already on that mountain.', 'Morning gets to the tops first. It always does.'],
    night: ['The moon’s catching the snow up there.', 'A little glow on the peaks. Somebody left the moon on.', 'Moonlight on the high snow. Very quiet up there.'],
    default: ['Warm up the peaks. The light’s right on them now.', 'Now the mountain’s catching the light.', 'The peaks are lit up. Just a little warmth on top.'],
  },
  sunset: {
    lines: ['Paint on the sun, and the whole sky warms up.', 'Warm paint on the sun, and the sky catches it.'],
    you: ['You touched the sun. Everything goes a little golden.'],
    auto: ['Paint landed on the sun. Everything goes a little golden.'],
  },
  moonGlow: {
    lines: ['Paint on the moon, and the whole sky lights up.', 'Light on the moon, and it spreads across the sky.'],
    you: ['You touched the moon. Everything goes a little silver.'],
    auto: ['Paint landed on the moon. Everything goes a little silver.'],
  },
  cloudOverSun: [
    'A little cloud wandered across the sun.',
    'A cloud drifted in front of the sun. He’ll move along.',
    'Some cloud over the sun. It softens the light a little.',
  ],
  cloudOverMoon: [
    'A little cloud drifted across the moon.',
    'A cloud in front of the moon. Just passing through.',
    'Some cloud over the moon. The night got a little softer.',
  ],
  storm: [
    'That cloud got heavy. Here comes a little rain.',
    'Dark paint on a cloud means weather.',
    'Weather’s coming. That cloud is full.',
    'It got dark, so now it’s raining over there.',
  ],
  sunlitCloud: [
    'The edges of that cloud caught the light.',
    'Warm paint on a cloud. Now its edges glow.',
    'Light caught the rim of that cloud. Just a little.',
    'Just warm up the edges. Leave the middle soft.',
    'That cloud’s got a bright rim now. It earned it.',
    'A little warmth along the top of that one.',
    'Touch the edge with light and walk away.',
    'The light found that cloud. Just along the edge.',
  ],
  lights: [
    'Somebody’s home. The lights just came on.',
    'Light in the window and smoke in the chimney.',
    'The windows lit up. Somebody’s making supper.',
  ],
  roofSnow: [
    'Snow on the roof. Cozy in there.',
    'White on the roof. It snowed on them.',
    'A little snow on top of the cabin. Warm inside.',
  ],
  garden: [
    'They planted a little garden out front.',
    'Flowers by the door. Somebody’s proud of those.',
    'A few flowers by the cabin. Somebody waters those.',
  ],
  moss: [
    'A little moss on the rock.',
    'Green on the rock. That’s moss, slow and patient.',
    'A little moss came in. Rocks don’t mind.',
  ],
  rockSnow: [
    'Snow on the rock.',
    'White on the rock. Snow sat right down on it.',
    'A little cap of snow on that rock.',
  ],
  rock: [
    'A little rock, sitting in the water, minding its own business.',
    'Knife it in, touch the top with light. That’s a rock now.',
    'A rock. Nothing moves it.',
  ],
  ripples: [
    'Just a few ripples. The water noticed.',
    'A little sparkle on the water.',
    'The water moved a little. That’s all.',
    'A couple of rings on the lake. Something stirred.',
    'Just a few lines on the water. Let them be.',
    'Rings going out across the water. Something jumped.',
    'Pull a thin line across. Water likes to lie flat.',
    'A little ruffle on the lake.',
    'The lake shivered a bit. Nothing to worry about.',
    'A few soft lines. The water’s settling down again.',
    'A breeze went over the lake and left a few lines.',
    'Just a whisper of movement out there.',
  ],
  birds: {
    lines: [
      'Every little drop that flew off turned into a bird.',
      'A couple of birds heard about the view.',
      'A few birds came by to see what we’re up to.',
      'Birds. Just a little check mark for each one.',
      'Some birds, way up. They’re heading somewhere.',
    ],
    night: ['A few birds, out late.', 'Night birds, heading home.', 'A few birds still up. They’ll sleep when they get there.'],
  },
  stars: [
    'Look at that. Every drop’s a star.',
    'A little spatter up there and the night fills itself in.',
    'Stars, every one of them a drop of paint.',
    'The sky filled up with little lights.',
    'Little lights all over up there. Count them if you like.',
  ],
  sun: [
    'That’s a sun if I ever saw one.',
    'Let’s give this painting some light.',
    'There’s the sun. Now everything has somewhere to look.',
  ],
  moon: [
    'The moon’s up. Everybody be quiet now.',
    'There’s the moon. Let him light the water.',
    'A moon came up. It’s all quiet now.',
  ],
  aurora: [
    'The sky’s doing that shimmery thing tonight.',
    'Green lights up there. The north does that sometimes.',
    'A little ribbon of light across the sky. Let it wave.',
  ],
  // What a paint turned into, when the color made the call.
  wisp: [
    'Just a wisp of cloud. Barely there.',
    'A little streak of cloud, thin as you like.',
    'A thin bit of cloud, just passing.',
    'Hardly a cloud at all. Just a breath of one.',
    'One little streak up there. That’s plenty.',
  ],
  goldenCloud: {
    lines: [
      'Yellow up there, so the cloud’s lit from underneath.',
      'A golden cloud. The yellow went right into it.',
      'Yellow up high makes a cloud with some glow to it.',
      'A cloud with some gold in it. Not every cloud gets that.',
      'Yellow in the sky. That cloud’s all lit up.',
      'A warm cloud. The yellow made it glow a bit.',
      'A little gold up there. That cloud’s catching something.',
      'Yellow in a cloud reads as light. Nobody questions it.',
      'A bright one. Leave some of it soft.',
      'That cloud got the good light.',
    ],
    night: ['A cloud with the moon on it. That’s where the yellow went.'],
    default: ['A cloud with the sun on it. That’s where the yellow went.'],
  },
  sunsetCloud: {
    lines: [
      'A pinkish cloud. It’s blushing a little.',
      'Red up high goes soft and rosy. That’s a cloud now.',
      'A little rose color in the sky. Leave it be.',
      'Pink up there. The cloud took the red and kept it.',
      'A rose-colored cloud. Nothing wrong with that.',
      'Just a touch of pink up there. Don’t fuss with it.',
      'A warm little cloud, pink at the edges.',
    ],
    evening: ['Red in the sky makes a sunset cloud.', 'A pink cloud. Somebody’s having a nice evening.', 'A rosy cloud. The day’s winding down.', 'Red up there turns into the end of the day.'],
    morning: ['Red in the sky, first thing. That’s a sunrise cloud.', 'A pink cloud. Somebody’s up early.', 'A pink cloud. The day’s just getting started.', 'Red in the morning sky. A rosy little cloud.'],
    night: ['A rosy cloud, out in the dark. Somebody’s up late.', 'Red up there makes a cloud with a little color left in it.', 'A dark red cloud, way up there.', 'A cloud with some red in it, even at night.'],
    default: ['Red in the sky makes a rosy cloud.', 'A pink cloud. The afternoon’s getting on.', 'A warm cloud. The red went right into it.', 'Somebody put a little red in the sky. Now it’s a cloud.'],
  },
  coolCloud: [
    'A cool blue cloud. Weather might be on the way.',
    'Blue in the sky makes a cool, shady cloud.',
    'A cloud with some blue in it. Might rain later.',
    'Cool paint up high. That’s a cloud in the shade.',
    'A blue-grey cloud, taking its time.',
    'Blue up high. That cloud’s keeping to the shade.',
    'A cool one. He’s not in any hurry.',
    'A little blue in the cloud. It’ll pass.',
    'Grey-blue and soft. Leave the edges loose.',
    'A shady cloud. Every sky needs one or two.',
    'That cloud’s thinking about rain. Hasn’t decided yet.',
  ],
  stormCloud: [
    'Dark paint up high? That’s a storm cloud.',
    'That one’s heavy. Dark clouds carry weather.',
    'A heavy cloud. Better bring the laundry in.',
    'Dark up there. Something’s brewing.',
    'That cloud means business.',
    'A big dark cloud. Somebody’s going to get wet.',
    'Dark and low. That one’s been saving up.',
    'Weather rolling in. Just let it sit there.',
    'A grumpy cloud. They all have days like that.',
    'Push the dark in at the bottom. That’s where the rain lives.',
    'You can almost hear that one.',
  ],
  snowyMountain: [
    'All that white is snow. There was a mountain under it.',
    'White, low in the sky. That’s a snowy peak.',
    'A snowy peak. Cold up there, but it looks good.',
    'Snow all over the top. Somebody likes winter.',
    'A white mountain. Leave a little shadow on one side.',
  ],
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
  tallTree: [
    'Green way up there? That’s the top of a tall tree.',
    'A tall one. He grew right up to where the paint landed.',
    'A big pine, all the way up. He doesn’t mind being tall.',
  ],
  snowyTreeline: [
    'A row of snowy trees, way off.',
    'Far-off trees, all in snow.',
    'A line of white trees on the far shore.',
  ],
  blueSpruce: [
    'Blue paint on the ground makes a blue spruce.',
    'A little blue spruce. They’re real, you know.',
    'Blue on the ground. That’s a spruce, cool and dark.',
  ],
  birch: [
    'White on the ground? A birch. White bark, dark marks.',
    'A birch tree. The white paint went into the bark.',
    'A birch. Pale bark, a few dark lines.',
  ],
  snowyTree: [
    'White on the land. A tree that’s been out in the snow.',
    'That white’s snow. There’s a tree under it.',
    'A tree, all snowed on. He’s been out all winter.',
  ],
  goldenTree: ['Yellow on the ground turns into a golden tree.', 'A golden fella. The yellow went into the leaves.'],
  redTree: ['A red one. Maples do that.', 'Red paint on the land makes a red tree.'],
  bareTree: [
    'Brown makes a bare tree. Just branches. He’s resting.',
    'No leaves on this one. Brown paint, bare branches.',
    'Bare branches. He’ll get his leaves back.',
  ],
  redCabin: [
    'Red on the land? A little red cabin.',
    'Somebody painted their cabin red. Good for them.',
    'A red cabin. You can see it from across the lake.',
  ],
  whiteCabin: [
    'A little white house. Somebody keeps it nice.',
    'A white cabin. Neat as a pin.',
    'White walls. A tidy little place by the water.',
  ],
  sailboat: [
    'White on the water is a sail. Somebody’s out on the lake.',
    'A little sailboat. The white paint caught the wind.',
    'A sail out on the lake. There’s a breeze today.',
  ],
  canoe: [
    'Red on the water. That’s a canoe.',
    'A red canoe, just drifting. Nobody’s in a hurry.',
    'Somebody left a canoe out. They’ll be back.',
    'A canoe. Red so you can find it.',
    'A little red boat, sitting still on the water.',
  ],
  glints: [
    'Light on the water. That’s where the paint went.',
    'A little sparkle where the light hits the lake.',
    'The water caught some light.',
    'A few bright spots on the lake. That’s the sky in there.',
    'Sparkle on the water. Just dab it and leave it.',
    'A few flecks of light, out on the water.',
    'Just touch the water and lift off. That’s a glint.',
    'The lake’s shining a little over there.',
    'Bright bits on the water. Don’t overdo these.',
    'Some light skipping across the lake.',
    'A dab here, a dab there. The water does the shining.',
    'The lake picked up a little light. It does that.',
  ],
  blueRipples: [
    'Blue on the water just moves the water around.',
    'A few ripples, cool and blue.',
    'The water wrinkled up a little.',
    'A few blue lines. The lake’s breathing.',
    'Some ripples. Something swam by, maybe.',
    'Blue on blue. The lake just got a little deeper.',
    'A few dark lines where the wind touched it.',
    'Cool lines across the water. Keep them flat.',
    'The lake got a little choppy there. It’ll smooth out.',
    'Blue ripples, going nowhere in particular.',
    'A bit of wind on the water. You can see where it went.',
  ],
  // Said while the name goes on, in whichever bottom corner it can be read in.
  signature: [
    'There. A little red in the corner, and it’s yours.',
    'Sign it small, in the corner. Good paintings don’t shout.',
    'Just your name, down in the corner. That makes it yours.',
  ],
  hung: [
    'It’s on the wall. Paint on if you like, or start a fresh one.',
    'That one’s hanging now. There’s always more paint.',
    'Up on the wall it goes. The easel’s still here if you want it.',
  ],
  // After a signing the browser wouldn't keep (the label has said so).
  unkept: ['It’s signed, but this browser wouldn’t keep it, so it isn’t on the wall.'],
  invite: ['Your turn. Tap, flick, or press and hold. Try hitting what’s already there, too.'],
  // Once a visit, when the first four goes on the canvas were all taps.
  nudge: [
    'Try flinging one. Or press and hold and let it pool.',
    'Taps are fine. Give one a flick sometime, or hold still and let it pool.',
    'Drag and let go to fling it. Or hold still and the paint pools.',
  ],
  done: [
    'That might be done. Sign it whenever you’re ready.',
    'Let’s step back and look at it. I think it’s done.',
    'I wouldn’t touch it again. Sign it when you’re ready.',
    'It’s found what it wanted to be. Sign it, or keep going.',
  ],
  undo: ['There’s no undo in here. Let’s see what it turns into instead.'],
};

const TOOLS = {
  wash: ['2-inch brush', ['Liquid White', 'Phthalo Blue', 'Alizarin Crimson']],
  cloud: ['1-inch brush', ['Titanium White', 'a whisper of Alizarin Crimson']],
  stormCloud: ['1-inch brush', ['Midnight Black', 'Prussian Blue']],
  coolCloud: ['1-inch brush', ['Titanium White', 'Phthalo Blue']],
  sunsetCloud: ['1-inch brush', ['Titanium White', 'Alizarin Crimson']],
  goldenCloud: ['1-inch brush', ['Titanium White', 'Cadmium Yellow']],
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
  return [...pool(LINES[key]), ...pool(LINES[ALSO[key]])];
}

// Specific keys that can also say their general kind's lines (a snowy mountain is still a mountain). They share one memory
// of what was said lately, so a line doesn't come round again from the other key.
const ALSO = {
  snowyMountain: 'mountain',
  blueMountain: 'mountain',
  brownMountain: 'mountain',
  redMountain: 'mountain',
  goldMountain: 'mountain',
  greenMountain: 'mountain',
  bankTree: 'bank',
  redTree: 'deciduous',
  goldenTree: 'deciduous',
};

export function line(key, ctx) {
  return pickFresh(ALSO[key] ?? key, linesFor(key, ctx));
}

// Paints ran together into a new color. Two are named; three or more are counted, so the line stays short. When one paint
// was so much more of it than the rest that the color didn't change (main, that paint's name), the line says so instead
// of "yellow and blue make yellow".
export function mixLine(names, color, main) {
  if (main) {
    const rest = names.filter((n) => n !== main);
    const few = rest.length <= 2;
    const list = few ? rest.join(' and ') : `the other ${num(rest.length)} paints`;
    return pickFresh('mixStill', [
      `${few ? `A little ${list}` : `A little of ${list}`} got into the ${main}. Still mostly ${color}.`,
      `Not enough ${few ? list : 'of the others'} to turn the ${main}. Still ${color}.`,
      `The ${main} won out over ${few ? 'the ' : ''}${list}. It’s still ${color}.`,
    ]);
  }
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

// The brush and paints for a kind of thing (or for the line the painter says about it, when that has its own: a storm
// cloud is painted dark), and a touch of the splat's own paint when they don't already name it. A paint of another hue
// than the splat's is left out (a blue cloud gets no whisper of crimson); when that leaves none, the splat's paint is the
// one named.
export function toolInfo(kind, pigment, key) {
  const t = TOOLS[key] ?? TOOLS[kind];
  if (!t) return '';
  const [tool, all] = t;
  const clashes = (name) => pigment && HUES.has(pigment.family) && HUES.has(familyIn(name)) && familyIn(name) !== pigment.family;
  const paints = all.filter((name) => !clashes(name));
  // A mixed splat's paint is its paints' names joined with "and": each is named once, and only if it isn't already.
  const own = pigment ? pigment.name.split(' and ') : [];
  const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
  if (!paints.length) return `${tool} · ${list(own)}`;
  const missing = own.filter((one) => !paints.some((name) => name.includes(one)));
  return `${tool} · ${paints.join(', ')}${missing.length ? ` · a touch of ${list(missing)}` : ''}`;
}

// ——— Titles ———

const PLACE_A = ['Hollow', 'Cedar', 'Otter', 'Wren', 'Bramble', 'Silver', 'Miller’s', 'Juniper', 'Heron', 'Quiet', 'Lantern', 'Foxglove', 'Birch', 'Stillwater', 'Old Mill', 'Kestrel'];
const PLACE_B = ['Creek', 'Lake', 'Cove', 'Pond', 'Hollow', 'Reach', 'Bend', 'Ridge', 'Meadow', 'Crossing', 'Narrows', 'Point'];

// For each mood: words to describe it, times of day to name, and the one word for the time of day it paints.
const MOOD = {
  'golden-hour': { adj: ['Golden', 'Late', 'Amber', 'Warm'], time: ['Late Afternoon', 'Sundown', 'Golden Hour'], hour: 'Evening' },
  'winter-hush': { adj: ['Quiet', 'Frozen', 'Hushed', 'Silver'], time: ['First Snow', 'Deep Winter', 'A Cold Morning'], hour: 'Morning' },
  'northern-night': { adj: ['Midnight', 'Starlit', 'Northern', 'Sleeping'], time: ['Midnight', 'Moonrise', 'The Long Night'], hour: 'Night' },
  'autumn-blaze': { adj: ['October', 'Copper', 'Blazing', 'Russet'], time: ['Early October', 'Harvest Time', 'The Turning'], hour: 'Afternoon' },
  'misty-morning': { adj: ['Misty', 'Soft', 'Early', 'Gentle'], time: ['Early Morning', 'First Light', 'Morning Fog'], hour: 'Morning' },
  'violet-dusk': { adj: ['Violet', 'Evening', 'Dusky', 'Lavender'], time: ['Dusk', 'Last Light', 'Nightfall'], hour: 'Evening' },
};

// What a painting could be named for: [one, many, weight], with many only when there are two or more of it (a canvas has
// one cabin and one moon at most). Stars are always many. The things a painting is remembered by (a cabin, a boat, the
// falls, an island, the moon, stars) weigh two and a half times what trees, peaks and stones do, shared among the words
// for each.
const STANDS_OUT = 2.5;
function subjects(counts) {
  const s = [];
  const add = (kind, weight, ...pairs) => {
    const n = [].concat(kind).reduce((sum, k) => sum + (counts[k] || 0), 0);
    if (n) for (const [one, many] of pairs) s.push([one, n >= 2 ? many : null, weight / pairs.length]);
  };
  add('cabin', STANDS_OUT, ['Cabin', 'Cabins'], ['Hideaway', 'Hideaways'], ['Homestead', 'Homesteads']);
  add('mountain', 1, ['Peak', 'Peaks'], ['Ridge', 'Ridges'], ['Mountain', 'Mountains']);
  add('evergreen', 1, ['Pine', 'Pines'], ['Evergreen', 'Evergreens']);
  add(['deciduous', 'bush'], 1, ['Grove', 'Groves'], ['Thicket', 'Thickets']);
  add('rock', 1, ['Stone', 'Stones']);
  add('island', STANDS_OUT, ['Island', 'Islands']);
  add('waterfall', STANDS_OUT, ['Falls', 'Falls']);
  add('sailboat', STANDS_OUT, ['Sail', 'Sails']);
  add('canoe', STANDS_OUT, ['Canoe', 'Canoes']);
  add('moon', STANDS_OUT, ['Moon', 'Moons']);
  if (counts.stars) s.push(['Stars', 'Stars', STANDS_OUT]);
  if (!s.length) s.push(['Water', 'Waters', 1], ['Sky', 'Skies', 1], ['Shore', 'Shores', 1]);
  return s;
}

// Adjectives that read as a color: "The Golden Mountain" over a grey-blue one looks like a mistake, so a peak, a ridge or
// a mountain doesn't get them.
const COLOR_WORDS = new Set(['Golden', 'Amber', 'Copper', 'Violet', 'Silver', 'Lavender', 'Russet']);
const PEAKS = new Set(['Peak', 'Peaks', 'Ridge', 'Ridges', 'Mountain', 'Mountains']);
const wordsOf = (text) => text.split(/[\s,]+/).filter(Boolean);

// One title. off is the words already in titles on the wall: place names that use them are left out while there are
// enough others, and subjects that use them come up less.
function oneTitle(counts, schemeId, off = new Set()) {
  const mood = MOOD[schemeId] || MOOD['golden-hour'];
  const fresh = (list) => {
    const left = list.filter((w) => !wordsOf(w).some((x) => off.has(x)));
    return left.length >= 3 ? left : list;
  };
  // A subject already named on the wall comes up a sixth as often, so a cabin with Cabin at Otter Cove on the wall is more
  // likely to be a Hideaway or a Homestead than a Thicket.
  const [one, many] = weighted(subjects(counts).map((sub) => [sub, sub[2] * (off.has(sub[0]) || off.has(sub[1]) ? 1 / 6 : 1)]));
  const adj = pick(mood.adj.filter((a) => !(one === 'Stars' && a === 'Starlit')));
  // The adjective right before the subject, in The Quiet Pine or Starlit Groves.
  const near = PEAKS.has(one) ? pick(mood.adj.filter((a) => !COLOR_WORDS.has(a))) : adj;
  const time = pick(mood.time);
  // Midnight Night and Evening Evening say it twice: just Midnight, just Evening.
  const hour = adj === 'Midnight' || adj === mood.hour ? adj : `${adj} ${mood.hour}`;
  // A place that says one of the title's other words again (Ridge at Stillwater Ridge, Silver Morning at Silver Lake) is
  // picked again.
  const taken = new Set([one, many, adj, near, ...wordsOf(time)]);
  let place;
  for (let i = 0; i < 6; i++) {
    place = `${pickFresh('placeA', fresh(PLACE_A))} ${pickFresh('placeB', fresh(PLACE_B))}`.replace('Hollow Hollow', 'Hollow Creek');
    if (!wordsOf(place).some((w) => taken.has(w))) break;
  }
  const templates = [
    () => `${one} at ${place}`,
    () => `${time} at ${place}`,
    () => `The ${near} ${one}`,
    () => `${place}, ${time}`,
    () => `${hour} at ${place}`,
  ];
  if (many) templates.push(() => `${near} ${many}`, () => `Where the ${many} Are`);
  return templates[pickFresh('title', templates.map((_, i) => i))]();
}

// A title for the painting; avoid is the titles already on the wall, which it tries not to repeat, and whose place names
// and subjects it steers clear of.
export function makeTitle(counts, schemeId, avoid = []) {
  const off = new Set(avoid.flatMap(wordsOf));
  for (const w of ['The', 'at', 'Where', 'the', 'Are']) off.delete(w);
  let title = oneTitle(counts, schemeId, off);
  for (let i = 0; i < 8 && avoid.includes(title); i++) title = oneTitle(counts, schemeId, off);
  return title;
}

// ——— Placard text ———

// What's in a painting, in the order the label names them: first what makes this painting this one (a cabin, a boat,
// the moon), then the things nearly every painting has. A bare tree and a birch are counted as deciduous trees too
// (counts.deciduous, which the titles and decide() read), so the leafy ones are what's left once they're taken off.
const FEATURE_NAMES = [
  ['cabin', 'a cabin', 'cabins'],
  ['waterfall', 'a waterfall', 'waterfalls'],
  ['sailboat', 'a sailboat', 'sailboats'],
  ['canoe', 'a canoe', 'canoes'],
  ['moon', 'the moon'],
  ['sun', 'the sun'],
  ['aurora', 'an aurora'],
  ['island', 'an island', 'islands'],
  ['stars', 'a sky full of stars'],
  ['rain', 'a passing rainstorm', 'passing rainstorms'],
  ['rock', 'a rock', 'rocks'],
  ['mountain', 'a mountain', 'mountains'],
  ['evergreen', 'a happy little tree', 'happy little trees'],
  ['leafy', 'a leafy tree', 'leafy trees'],
  ['bare', 'a bare tree', 'bare trees'],
  ['birch', 'a birch', 'birches'],
  ['bush', 'a bush', 'bushes'],
  ['cloud', 'a cloud', 'clouds'],
  ['birds', 'a flock of birds', 'flocks of birds'],
  ['flowers', 'some flowers', 'patches of flowers'],
  ['bank', 'a bit of shore', 'stretches of shore'],
  ['treeline', 'a distant forest', 'distant forests'],
];

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const num = (n) => WORDS[n] || String(n);

// Under the label, when the browser wouldn't keep the painting, or kept it by taking older ones down beyond the usual
// 12th. Empty when all went as usual.
export function keptNote({ kept, dropped }, canSave = true) {
  if (!kept) return `This browser isn’t keeping paintings, so this one won’t go up on the wall. ${canSave ? 'Download it to keep it.' : 'Save the picture to keep it.'}`;
  if (dropped === 1) return 'The browser ran short of room, so the oldest painting came down to make space for this one.';
  if (dropped > 1) return `The browser ran short of room, so the ${num(dropped)} oldest paintings came down to make space for this one.`;
  return '';
}

function features(counts) {
  const n = (key) => (key === 'leafy' ? (counts.deciduous || 0) - (counts.bare || 0) - (counts.birch || 0) : counts[key] || 0);
  const parts = [];
  for (const [key, one, many] of FEATURE_NAMES) {
    const k = n(key);
    if (k > 0) parts.push(k === 1 || !many ? one : `${num(k)} ${many}`);
  }
  return parts;
}

// What's on the canvas, for a screen reader: everything, with no "and more".
export function canvasContents(counts) {
  const parts = features(counts);
  if (!parts.length) return 'Nothing on it yet but sky and water.';
  const last = parts.pop();
  return `It has ${parts.length ? `${parts.join(', ')} and ` : ''}${last}.`;
}

// The label names four things at most, what stands out first.
export function featureLine(counts) {
  const parts = features(counts);
  if (!parts.length) return 'Mostly sky and water, which is plenty.';
  if (parts.length === 1) return `Features ${parts[0]}.`;
  if (parts.length > 4) return `Features ${parts.slice(0, 4).join(', ')} and more.`;
  const last = parts.pop();
  return `Features ${parts.join(', ')} and ${last}.`;
}

// How long a painting took, as the label says it: under a minute to the second, under an hour to the nearest minute,
// and from an hour on to the nearest five minutes ("about" when that comes to whole hours).
export function durationText(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return s === 1 ? '1 second' : `${s} seconds`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return minutes === 1 ? 'a minute' : `${minutes} minutes`;
  const five = Math.round(minutes / 5) * 5;
  const h = Math.floor(five / 60);
  const m = five % 60;
  const hours = h === 1 ? 'an hour' : `${h} hours`;
  return m ? `${hours} and ${m} minutes` : `about ${hours}`;
}

export function madeFrom(accidents, seconds) {
  if (!accidents) return `Painted wet-on-wet without a single accident, in ${durationText(seconds)}.`;
  const a = accidents === 1 ? 'one happy accident' : `${accidents <= 20 ? num(accidents) : accidents} happy accidents`;
  return `Painted wet-on-wet from ${a} in ${durationText(seconds)}.`;
}

