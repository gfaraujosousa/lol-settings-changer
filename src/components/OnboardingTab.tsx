import emptyMascot from '../assets/empty-mascot.png';
import { useLocale } from '../i18n/LocaleContext';

export function OnboardingTab({ onOpenDesk }: { onOpenDesk: () => void }) {
  const { messages } = useLocale();
  const steps = [
    { title: messages.onboarding.step1Title, body: messages.onboarding.step1Body },
    { title: messages.onboarding.step2Title, body: messages.onboarding.step2Body },
    { title: messages.onboarding.step3Title, body: messages.onboarding.step3Body },
    { title: messages.onboarding.step4Title, body: messages.onboarding.step4Body },
  ];

  return (
    <section className="tab-page onboarding-page">
      <img className="onboarding-art" src={emptyMascot} alt="" width={240} height={180} />
      <div className="onboarding-copy">
        <h2>{messages.onboarding.title}</h2>
        <p className="onboarding-lead">{messages.onboarding.lead}</p>
        <ol className="onboarding-steps">
          {steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="stamp-button stamp-button-gold" onClick={onOpenDesk}>
          {messages.onboarding.cta}
        </button>
      </div>
    </section>
  );
}
