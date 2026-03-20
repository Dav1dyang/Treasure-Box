import type { DrawerStyle, DrawerStylePreset } from './types';

type SoundType = 'collision' | 'drawer-open' | 'drawer-close';

/** Material-to-sound character mapping */
const SOUND_CHARACTERS: Record<DrawerStylePreset, {
  collision: string;
  drawerOpen: string;
  drawerClose: string;
  material: string;
}> = {
  clay: {
    collision: 'a soft, muted thud like a small clay object hitting a clay surface — dull, rounded impact with no ring',
    drawerOpen: 'a soft clay drawer sliding open — gritty, earthy friction with a gentle scrape',
    drawerClose: 'a clay drawer slamming shut — a dull, heavy thud with a muted impact',
    material: 'clay / ceramic',
  },
  metal: {
    collision: 'a sharp metallic clang like a small metal object hitting a steel drawer — bright, resonant ping with slight ring',
    drawerOpen: 'a metal drawer sliding open — industrial steel rails with a smooth metallic scrape',
    drawerClose: 'a metal drawer slamming shut — a heavy metallic bang with brief reverb',
    material: 'metal / steel / iron',
  },
  wood: {
    collision: 'a warm wooden knock like a small object hitting a wooden drawer — hollow, resonant tap',
    drawerOpen: 'a wooden drawer sliding open — smooth wood-on-wood friction with a gentle creak',
    drawerClose: 'a wooden drawer slamming shut — a solid wooden thump with brief rattle',
    material: 'polished wood',
  },
  pixel: {
    collision: 'a short 8-bit retro bleep — a crisp chiptune impact sound like from a 16-bit video game',
    drawerOpen: 'a retro 8-bit power-up or menu-open sound — ascending chiptune beeps',
    drawerClose: 'a retro 8-bit close sound — a descending chiptune bloop or thud',
    material: 'pixel art / retro game',
  },
  paper: {
    collision: 'a soft paper crumple or rustle — light, crispy friction like paper shifting on paper',
    drawerOpen: 'a paper drawer sliding open — a light cardboard scrape with a soft whoosh',
    drawerClose: 'a paper drawer closing — a soft cardboard flap with a gentle tap',
    material: 'paper / cardboard / origami',
  },
  glass: {
    collision: 'a delicate crystalline tink like a small glass object touching a glass surface — bright, high-pitched, with a shimmer',
    drawerOpen: 'a glass drawer sliding open — a smooth, crystalline slide with a gentle chime',
    drawerClose: 'a glass drawer closing — a crisp glass-on-glass tap with a brief ring',
    material: 'glass / crystal',
  },
};

const DURATION: Record<SoundType, string> = {
  collision: '0.15 to 0.3 seconds',
  'drawer-open': '0.4 to 0.7 seconds',
  'drawer-close': '0.3 to 0.5 seconds',
};

/**
 * Build a Gemini prompt to generate a specific sound effect
 * matching the drawer's visual style.
 */
export function buildSoundPrompt(style: DrawerStyle, soundType: SoundType): string {
  const chars = SOUND_CHARACTERS[style.preset];
  const description = soundType === 'collision'
    ? chars.collision
    : soundType === 'drawer-open'
      ? chars.drawerOpen
      : chars.drawerClose;

  const duration = DURATION[soundType];

  return `Generate a single, very short sound effect audio clip.

SOUND DESCRIPTION:
${description}

REQUIREMENTS:
- Duration: exactly ${duration} — no longer
- Pure foley / sound design — absolutely NO music, NO melody, NO speech, NO voice
- Single sound event, not a loop or sequence
- Clean audio with no background noise or hiss
- Suitable for a web app UI interaction sound
- The sound should feel like it belongs to a ${chars.material} object

CONTEXT:
This sound is for an interactive web widget that shows a decorative furniture drawer (made of ${chars.material}).
${soundType === 'collision' ? 'This sound plays when small treasure items collide inside the drawer. It will be played rapidly and repeatedly, so it must be very short and clean.' : ''}
${soundType === 'drawer-open' ? 'This sound plays once when the user opens the drawer.' : ''}
${soundType === 'drawer-close' ? 'This sound plays once when the drawer slams shut.' : ''}

OUTPUT: Generate only the audio. No text response needed.`;
}
