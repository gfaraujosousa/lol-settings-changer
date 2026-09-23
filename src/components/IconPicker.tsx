import { PROFILE_ICON_IDS, PROFILE_ICON_LABELS, type ProfileIconId } from '../lib/profileIcons';
import { PROFILE_ICON_SRC } from './profileIconArt';
import { useLocale } from '../i18n/LocaleContext';

interface IconPickerProps {
  value: ProfileIconId;
  disabled?: boolean;
  onChange: (iconId: ProfileIconId) => void;
}

export function IconPicker({ value, disabled = false, onChange }: IconPickerProps) {
  const { messages } = useLocale();

  return (
    <div className="icon-picker" role="listbox" aria-label={messages.common.icon}>
      {PROFILE_ICON_IDS.map((iconId) => {
        const selected = value === iconId;
        return (
          <button
            key={iconId}
            type="button"
            role="option"
            aria-selected={selected}
            className={`icon-picker-option${selected ? ' icon-picker-option-selected' : ''}`}
            disabled={disabled}
            title={PROFILE_ICON_LABELS[iconId]}
            onClick={() => onChange(iconId)}
          >
            <img src={PROFILE_ICON_SRC[iconId]} alt={PROFILE_ICON_LABELS[iconId]} width={40} height={40} />
          </button>
        );
      })}
    </div>
  );
}
