import emptyMascot from '../assets/empty-mascot.png';
import { useLocale } from '../i18n/LocaleContext';
import { describeProfile } from '../lib/profileStore';
import type { GroupedProfiles, SettingsProfile } from '../lib/profileStore';
import { ProfileBadge } from './ProfileBadge';

interface ProfileRosterProps {
  groupedProfiles: GroupedProfiles;
  profileCount: number;
  selectedProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onFocusSaveName: () => void;
}

function ProfileButton({
  profile,
  selected,
  onSelect,
  noTags,
}: {
  profile: SettingsProfile;
  selected: boolean;
  onSelect: () => void;
  noTags: string;
}) {
  const descriptor = describeProfile(profile);

  return (
    <button
      className={`profile-row${selected ? ' profile-row-selected' : ''}`}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <ProfileBadge iconId={profile.iconId} size={36} />
      <span>
        <strong>{profile.name}</strong>
        <small>{descriptor.freeformTags.length ? descriptor.freeformTags.join(', ') : noTags}</small>
      </span>
    </button>
  );
}

export function ProfileRoster({
  groupedProfiles,
  profileCount,
  selectedProfileId,
  onSelectProfile,
  onFocusSaveName,
}: ProfileRosterProps) {
  const { messages } = useLocale();

  if (profileCount === 0) {
    return (
      <section className="panel-card profile-roster">
        <div className="section-heading">
          <h2>{messages.roster.title}</h2>
          <span>0</span>
        </div>
        <div className="roster-empty">
          <img className="roster-empty-mascot" src={emptyMascot} alt="" width={140} height={105} />
          <p className="empty-state">{messages.roster.empty}</p>
          <button type="button" className="stamp-button stamp-button-gold" onClick={onFocusSaveName}>
            {messages.roster.saveCta}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-card profile-roster">
      <div className="section-heading">
        <h2>{messages.roster.title}</h2>
        <span>{profileCount}</span>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">
          <h3>{messages.roster.shared}</h3>
          <span>{groupedProfiles.shared.length}</span>
        </div>
        {groupedProfiles.shared.length === 0 ? (
          <p className="empty-state">{messages.roster.noShared}</p>
        ) : (
          <div className="profile-list">
            {groupedProfiles.shared.map((profile) => (
              <ProfileButton
                key={profile.id}
                profile={profile}
                selected={selectedProfileId === profile.id}
                onSelect={() => onSelectProfile(profile.id)}
                noTags={messages.roster.noTags}
              />
            ))}
          </div>
        )}
      </div>

      <div className="profile-section">
        <div className="profile-section-title">
          <h3>{messages.roster.accounts}</h3>
          <span>{groupedProfiles.accounts.length}</span>
        </div>
        {groupedProfiles.accounts.length === 0 ? (
          <p className="empty-state">{messages.roster.noAccounts}</p>
        ) : (
          <div className="account-list">
            {groupedProfiles.accounts.map((group) => (
              <div className="account-group" key={group.structuralTag}>
                <div className="account-heading">
                  <strong>{group.accountName}</strong>
                  <small>{group.profiles.length}</small>
                </div>
                <div className="profile-list">
                  {group.profiles.map((profile) => (
                    <ProfileButton
                      key={profile.id}
                      profile={profile}
                      selected={selectedProfileId === profile.id}
                      onSelect={() => onSelectProfile(profile.id)}
                      noTags={messages.roster.noTags}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
