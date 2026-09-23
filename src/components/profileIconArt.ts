import type { ProfileIconId } from '../lib/profileIcons';
import contract from '../assets/profile-icons/contract.png';
import crossedBlades from '../assets/profile-icons/crossed-blades.png';
import hexCrystal from '../assets/profile-icons/hex-crystal.png';
import hornedGear from '../assets/profile-icons/horned-gear.png';
import yellowEye from '../assets/profile-icons/yellow-eye.png';

export const PROFILE_ICON_SRC: Record<ProfileIconId, string> = {
  'horned-gear': hornedGear,
  contract,
  'yellow-eye': yellowEye,
  'hex-crystal': hexCrystal,
  'crossed-blades': crossedBlades,
};
