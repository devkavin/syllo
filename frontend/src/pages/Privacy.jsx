import React from "react";
import LegalLayout, { LegalSection } from "@/components/LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      summary="This policy explains what Syllo collects, why we use it, who helps us process it, and the choices available to students and their families."
    >
      <LegalSection title="Who operates Syllo">
        <p>
          Syllo is operated by <strong>Kavindra Senanayake, an individual trading as Syllo</strong>, based in Colombo, Sri Lanka. In this policy, “Syllo”, “we”, and “us” refer to that operator.
        </p>
      </LegalSection>

      <LegalSection title="Information we collect">
        <ul>
          <li><strong>Account information:</strong> name, email address, password hash, profile details, authentication provider, and—when you use Google sign-in—your Google account identifier and available profile information.</li>
          <li><strong>Study information:</strong> subjects, units, lessons, notes, notebooks, tasks, schedules, reviews, focus sessions, progress, goals, and other content you choose to add.</li>
          <li><strong>Study Companion information:</strong> prompts, selected notebook or study content sent for an explanation or summary, generated responses, model name, token counts, latency, and help usage.</li>
          <li><strong>Billing information:</strong> plan, subscription status, transaction references, and Stripe customer or subscription identifiers. Syllo does not store full payment-card details.</li>
          <li><strong>Referral and usage information:</strong> referral codes and rewards, feature activity, timestamps, device or browser information made available in normal web requests, and security logs.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use information">
        <p>We use this information to provide and secure Syllo, save and synchronize your academic workspace, operate focus and review features, calculate progress, authenticate accounts, process subscriptions, prevent abuse, respond to support requests, and improve reliability.</p>
        <p>Where applicable, processing is based on providing the service you request, your consent, our legitimate interests in operating a safe and useful service, and compliance with legal obligations.</p>
      </LegalSection>

      <LegalSection title="Service providers and international processing">
        <p>We use service providers only where needed to operate Syllo:</p>
        <ul>
          <li><strong>Google</strong> for optional Google sign-in.</li>
          <li><strong>Google Gemini</strong> to process Study Companion requests. Do not include sensitive personal information in prompts or notes submitted to this feature.</li>
          <li><strong>Stripe</strong> for checkout, subscriptions, invoices, and payment-account management.</li>
          <li><strong>Hosting and database providers</strong> to run the application and store Syllo account and study data in a hosted MySQL database.</li>
        </ul>
        <p>These providers may process information outside Sri Lanka under their own security and privacy programs. We do not sell personal information or use it for third-party advertising.</p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>Syllo uses essential cookies for authentication, session security, and Google sign-in state. The application also uses browser storage for preferences such as theme and limited device-side feature state, including an active focus timer. We do not currently use advertising cookies.</p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>We generally retain account and study information while your account is active. We may retain limited billing, security, fraud-prevention, and legal records for as long as reasonably necessary. Deleted information may remain temporarily in protected backups before routine expiry.</p>
        <p>You may request account access, correction, export, or deletion by emailing <a href="mailto:privacy@syllo.kavinhq.com">privacy@syllo.kavinhq.com</a>. We may need to verify your identity before completing a request.</p>
      </LegalSection>

      <LegalSection title="Students under 16">
        <p>Syllo is designed for students of different ages. If you are under 16, use Syllo only with permission from a parent or legal guardian. By creating an account, you confirm that you have this permission. A parent or guardian may contact us to ask about, correct, or request deletion of a child’s account information.</p>
      </LegalSection>

      <LegalSection title="Security">
        <p>We use reasonable technical and organizational safeguards, including password hashing, protected authentication cookies, access controls, encrypted provider connections, and restricted server-side credentials. No internet service can guarantee absolute security.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>We may update this policy as Syllo changes or legal requirements develop. Material changes will be shown in the application or on this page with a revised effective date.</p>
        <p>Privacy questions: <a href="mailto:privacy@syllo.kavinhq.com">privacy@syllo.kavinhq.com</a><br />General support: <a href="mailto:support@syllo.kavinhq.com">support@syllo.kavinhq.com</a><br />Kavin HQ, trading as Syllo — Colombo, Sri Lanka</p>
      </LegalSection>
    </LegalLayout>
  );
}
