import { PROFILE_ICON_LABELS, normalizeProfileIconId } from '../lib/profileIcons';
import { PROFILE_ICON_SRC } from './profileIconArt';

interface ProfileBadgeProps {
  iconId?: string;
  size?: number;
}

export function ProfileBadge({ iconId, size = 36 }: ProfileBadgeProps) {
  const resolved = normalizeProfileIconId(iconId);

  return (
    <img
      className="profile-badge"
      src={PROFILE_ICON_SRC[resolved]}
      alt={PROFILE_ICON_LABELS[resolved]}
      width={size}
      height={size}
    />
  );
}
