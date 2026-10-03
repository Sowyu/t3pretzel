import type {
  ProviderApprovalDecision,
  ProviderApprovalOption,
  RuntimeRequestId,
} from "@t3tools/contracts";
import { useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import type { PendingApproval } from "../../lib/threadActivity";
import { RequestActionButton } from "./RequestActionButton";

export interface PendingApprovalCardProps {
  readonly approval: PendingApproval;
  readonly respondingApprovalId: RuntimeRequestId | null;
  readonly onRespond: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

const DEFAULT_APPROVAL_OPTIONS: ReadonlyArray<ProviderApprovalOption> = [
  { decision: "accept", label: "Allow once" },
  { decision: "acceptForSession", label: "Allow session" },
  { decision: "decline", label: "Decline" },
];

export function PendingApprovalCard(props: PendingApprovalCardProps) {
  const options: ReadonlyArray<ProviderApprovalOption> =
    props.approval.options ?? DEFAULT_APPROVAL_OPTIONS;
  const warning = options.find((option) => option.warning)?.warning;
  const responding = props.respondingApprovalId === props.approval.requestId;
  // The decision in flight, so only its button shows a spinner.
  const [pressedDecision, setPressedDecision] = useState<ProviderApprovalDecision | null>(null);
  // A request whose provider process exited can no longer be answered.
  const canRespond = props.approval.responseCapability === "live";
  // Opaque for the same reason as PendingUserInputCard: nothing blurs the feed
  // behind this card, so a translucent surface bleeds messages through it.
  return (
    <View className="gap-2.5 rounded-[20px] border border-border bg-card-alt p-4">
      <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
        Approval needed
      </Text>
      <Text className="font-t3-bold text-lg text-foreground">
        {props.approval.appName ?? props.approval.requestKind}
      </Text>
      {props.approval.detail ? (
        <Text className="font-sans text-sm leading-normal text-foreground-secondary">
          {props.approval.detail}
        </Text>
      ) : null}
      {!canRespond ? (
        <Text className="font-sans text-sm leading-5 text-foreground-muted">
          The provider process for this request is no longer available. Interrupt or restart the run
          to continue.
        </Text>
      ) : null}
      {warning ? (
        <Text className="font-sans text-xs leading-normal text-warning-foreground">{warning}</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2.5">
        {options.map((option) => (
          <RequestActionButton
            key={option.decision}
            label={option.label}
            tone={
              option.decision === "accept"
                ? "primary"
                : option.decision === "decline"
                  ? "danger"
                  : "secondary"
            }
            busy={responding && pressedDecision === option.decision}
            disabled={!canRespond || responding}
            onPress={() => {
              setPressedDecision(option.decision);
              void props.onRespond(props.approval.requestId, option.decision);
            }}
          />
        ))}
      </View>
    </View>
  );
}
