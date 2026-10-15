import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { OnboardingWizard, type WizardStep } from "@/app/components/shared/OnboardingWizard";
import { FieldRow } from "@/app/components/shared/FieldRow";
import { LiveTestState } from "@/app/components/shared/LiveTestState";
import { RedirectingToProvider } from "@/app/components/shared/RedirectingToProvider";
import { SuccessState, ErrorState } from "@/app/components/shared/StateViews";
import { SeverityBadge, SEVERITY_META } from "@/app/components/shared/HealthBadge";
import { ChannelMonogram } from "@/app/components/shared/ChannelMonogram";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { useSession } from "@/app/lib/SessionContext";
import { CHANNEL_TYPES, withChannel, type ChannelType, type NotificationChannel } from "@/app/lib/notifications";
import type { Severity } from "@/app/data/fleet";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

/**
 * Connecting a notification channel runs through the same `OnboardingWizard`
 * shell as every source and destination: same breadcrumb, step counter,
 * progress rail, fixed Continue, the same sign-in redirect beat, the same
 * live test with its failure checklist, the same success screen. Someone
 * who has connected ten sources already knows how this goes, and Cruz knows
 * which step they're on.
 */
export default function NotificationConnect() {
  const { type = "" } = useParams();
  const navigate = useNavigate();
  const { setNotifications, notifications } = useSession();
  const def = CHANNEL_TYPES[type as ChannelType];
  // Places of this type already connected can't be picked again, a second
  // copy would just send every alert there twice.
  const taken = notifications.channels.filter((c) => c.type === type).map((c) => c.target);
  const available = def?.targets?.options.filter((o) => !taken.includes(o)) ?? [];
  const [field, setField] = useState("");
  const [target, setTarget] = useState(available[0] ?? "");
  const [severities, setSeverities] = useState<Severity[]>(def?.defaults ?? []);
  const [tested, setTested] = useState(false);
  const channelId = useRef(`ch-${Date.now().toString(36)}`).current;

  if (!def) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <ErrorState
          title="We could not find that channel"
          description={`Nothing matches "${type}". It may have been renamed.`}
          onRetry={() => navigate("/notifications")}
          retryLabel="Back to notifications"
        />
      </div>
    );
  }

  const channelType = type as ChannelType;
  const effectiveTarget = def.targets ? target : field.trim();
  const duplicate = !def.targets && taken.some((t) => t.toLowerCase() === effectiveTarget.toLowerCase());
  const connect = () =>
    setNotifications((n) =>
      withChannel(n, { id: channelId, type: channelType, target: effectiveTarget, connectedAt: Date.now() } as NotificationChannel, severities),
    );
  const backToNotifications = () => navigate("/notifications", { state: { highlightChannelId: channelId } });

  const steps: WizardStep[] = [
    {
      id: "connect",
      label: def.auth === "oauth" ? `Sign in to ${def.provider}` : `Connect ${def.name}`,
      render: () =>
        def.auth === "oauth" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sign in to {def.provider} and approve the Databahn app. It can only post messages, it can't read your channels or history.
            </p>
            <p className="text-sm text-muted-foreground">You'll pick exactly where alerts go on the next step.</p>
          </div>
        ) : (
          <FieldRow label={def.field!.label} hint={def.field!.hint} askCruzQuestion={`Where do I find the ${def.name} ${def.field!.label.toLowerCase()}?`}>
            <Input value={field} onChange={(e) => setField(e.target.value)} placeholder={def.field!.placeholder} autoFocus />
            {duplicate && <p className="text-xs text-amber-300 mt-1.5">Already connected. Alerts would be sent there twice.</p>}
          </FieldRow>
        ),
      primary: {
        label: def.auth === "oauth" ? `Sign in with ${def.provider}` : "Continue",
        disabled: def.auth === "fields" && (field.trim().length < 4 || duplicate),
      },
    },
    // Only a real sign-in leaves Databahn, so only OAuth gets the redirect
    // beat, the same one Sentinel's sign-in uses.
    ...(def.auth === "oauth"
      ? [
          {
            id: "redirecting",
            label: `Redirecting to ${def.provider}`,
            render: () => <RedirectingToProvider provider={def.provider ?? def.name} />,
            primary: { label: "Continue" },
          },
        ]
      : []),
    {
      id: "where",
      label: "Choose where alerts go",
      render: () => (
        <div>
          {def.targets && (
            <FieldRow label={def.targets.label} hint={`Where in ${def.name} Databahn posts.`} askCruzQuestion={`Which alerts should go to ${def.name}?`}>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger aria-label={def.targets.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {def.targets.options.map((o) => (
                    <SelectItem key={o} value={o} disabled={taken.includes(o)}>
                      {o}
                      {taken.includes(o) && <span className="text-muted-foreground ml-1">(already connected)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          )}
          <fieldset>
            <legend className="text-sm font-medium text-foreground mb-2">Alerts sent here</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SEVERITIES.map((sv) => (
                <label key={sv} className="flex items-start gap-2.5 cursor-pointer rounded border border-border bg-background/40 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={severities.includes(sv)}
                    onChange={(e) => setSeverities((prev) => (e.target.checked ? [...prev, sv] : prev.filter((x) => x !== sv)))}
                    className="mt-0.5 accent-[var(--db-blue)]"
                  />
                  <span>
                    <SeverityBadge severity={sv} />
                    <span className="block text-xs text-muted-foreground mt-0.5">{SEVERITY_META[sv].definition}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Suggested for {def.name}: {def.defaults.map((d) => SEVERITY_META[d].label.toLowerCase()).join(" and ")}
              {def.delivery === "digest" ? ", sent as one daily digest." : ", sent the moment it happens."}
            </p>
          </fieldset>
        </div>
      ),
      primary: { label: "Continue", disabled: !effectiveTarget || severities.length === 0 },
      ...(def.targets && available.length === 0
        ? { render: () => <p className="text-sm text-muted-foreground">Every {def.targets!.label.toLowerCase()} in this workspace is already connected.</p> }
        : {}),
    },
    {
      id: "test",
      label: "Send a test",
      render: () => (
        <LiveTestState
          targetLabel={effectiveTarget}
          successSampleLines={def.testLines(effectiveTarget)}
          checklist={
            def.auth === "oauth"
              ? [`The Databahn app is installed in your ${def.provider} workspace`, "The app has been added to the chosen channel or service"]
              : ["The value from the first step is complete and current", "Nothing on your network blocks outbound requests to it"]
          }
          escapeHatchLabel="Connect anyway, I'll test later"
          // Saved the moment the test passes (or is deliberately skipped),
          // so leaving from the success screen any way at all keeps it.
          onComplete={(r) => {
            if (r === "timeout") return;
            setTested(true);
            connect();
          }}
        />
      ),
      primary: { label: "Continue", disabled: !tested },
    },
    {
      id: "success",
      label: `${def.name} connected`,
      render: () => (
        <SuccessState
          title={`${def.name} is connected`}
          description={`${severities
            .map((sv) => SEVERITY_META[sv].label)
            .join(", ")
            .replace(/, ([^,]*)$/, " and $1")} alerts go to ${effectiveTarget}${def.delivery === "digest" ? " in a daily digest" : " the moment they happen"}.`}
        >
          <div className="flex flex-col items-center gap-3 max-w-xs mx-auto w-full">
            <Button size="lg" className="w-full" onClick={backToNotifications}>
              Back to notifications
            </Button>
            <Button size="lg" variant="outline" className="w-full" onClick={() => navigate("/notifications")}>
              Connect another channel
            </Button>
          </div>
        </SuccessState>
      ),
    },
  ];

  return (
    <OnboardingWizard
      connectorName={def.name}
      connectorKind="notification"
      steps={steps}
      logo={<ChannelMonogram type={channelType} size={40} />}
    />
  );
}
