import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { useFlowWorkItemQueueController } from "../model/useFlowWorkItemQueueController";
import { FlowWorkItemCompleteDialog } from "./FlowWorkItemCompleteDialog";
import { FlowWorkItemQueue } from "./FlowWorkItemQueue";
import { FlowWorkItemSnoozeDialog } from "./FlowWorkItemSnoozeDialog";
import styles from "./FlowWorkItemQueuePanel.module.css";

export type FlowWorkItemQueuePanelProps = {
  readonly locale: "ru" | "en";
  readonly limit?: 5 | 50;
  readonly className?: string;
  readonly headerAction?: ReactNode;
  /** Gallery surfaces keep a successful empty queue out of the primary workspace. */
  readonly hideWhenEmpty?: boolean;
};

export function FlowWorkItemQueuePanel({
  locale,
  limit = 50,
  className,
  headerAction,
  hideWhenEmpty = false
}: FlowWorkItemQueuePanelProps) {
  const controller = useFlowWorkItemQueueController({ locale, limit });
  const copy = panelCopy[locale];

  if (controller.profileState === "loading") {
    return (
      <section
        className={mergeClassNames(styles.stateBand, className)}
        aria-busy="true"
        aria-label={copy.heading}
      >
        <Icon iconName="clock" width={18} height={18} aria-hidden="true" />
        <span>{copy.loadingProfile}</span>
      </section>
    );
  }

  if (controller.profileState === "error" || !controller.timeZone) {
    const profileRequired = controller.profileState === "profile_required";
    return (
      <section
        className={mergeClassNames(styles.stateBand, className)}
        aria-label={copy.heading}
        role={profileRequired ? undefined : "alert"}
        data-state={profileRequired ? "profile-required" : "error"}
      >
        <span className={styles.stateIcon} aria-hidden="true">
          <Icon iconName={profileRequired ? "settings" : "lightning"} width={17} height={17} />
        </span>
        <span className={styles.stateCopy}>
          <strong>{profileRequired ? copy.profileRequiredTitle : copy.profileErrorTitle}</strong>
          <span>
            {profileRequired ? copy.profileRequiredDescription : copy.profileErrorDescription}
          </span>
        </span>
        {profileRequired ? (
          <ConfigureProfileButton className={styles.stateAction} title={copy.configureProfile} />
        ) : (
          <Button
            className={styles.stateAction}
            size="small"
            variant="glass"
            title={copy.retry}
            startIcon={<Icon iconName="refresh" width={13} height={13} aria-hidden="true" />}
            onClick={() => controller.retryProfile()}
          />
        )}
      </section>
    );
  }

  if (
    hideWhenEmpty &&
    !controller.isLoading &&
    !controller.isError &&
    controller.total === 0 &&
    controller.snoozeTarget === null &&
    controller.completionTarget === null
  ) {
    return null;
  }

  return (
    <div className={mergeClassNames(styles.root, className)}>
      <FlowWorkItemQueue
        items={controller.items}
        total={controller.total}
        asOf={controller.asOf}
        locale={locale}
        timeZone={controller.timeZone}
        isLoading={controller.isLoading}
        isError={controller.isError}
        isFetching={controller.isFetching}
        headerAction={headerAction}
        commandStateByWorkItemId={controller.commandStateByWorkItemId}
        onStart={controller.start}
        onSnooze={controller.openSnooze}
        onComplete={controller.openComplete}
        onRetry={() => void controller.retry()}
      />
      <FlowWorkItemSnoozeDialog
        open={controller.snoozeTarget !== null}
        locale={locale}
        timeZone={controller.timeZone}
        workItemTitle={controller.snoozeTarget?.workItem.title ?? ""}
        pending={controller.snoozePending}
        error={controller.snoozeError}
        onClose={controller.closeSnooze}
        onConfirm={controller.confirmSnooze}
      />
      <FlowWorkItemCompleteDialog
        entry={controller.completionTarget}
        locale={locale}
        pending={controller.completionPending}
        error={controller.completionError}
        onClose={controller.closeComplete}
        onConfirm={controller.confirmComplete}
      />
    </div>
  );
}

function ConfigureProfileButton({
  className,
  title
}: {
  readonly className?: string;
  readonly title: string;
}) {
  const navigate = useNavigate();

  return (
    <Button
      className={className}
      size="small"
      variant="brand"
      title={title}
      startIcon={<Icon iconName="settings" width={13} height={13} aria-hidden="true" />}
      onClick={() => navigate("/settings")}
    />
  );
}

function mergeClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

const panelCopy = {
  ru: {
    heading: "Задачи из воронок",
    loadingProfile: "Загружаем часовой пояс профиля",
    profileRequiredTitle: "Настройте часовой пояс профиля",
    profileRequiredDescription: "Он нужен для сроков и отложенных задач из воронок.",
    profileErrorTitle: "Не удалось загрузить часовой пояс",
    profileErrorDescription: "Очередь скрыта, чтобы не показать неверное время.",
    configureProfile: "Настроить профиль",
    retry: "Повторить"
  },
  en: {
    heading: "Flow tasks",
    loadingProfile: "Loading the profile timezone",
    profileRequiredTitle: "Set your profile timezone",
    profileRequiredDescription: "It is required for flow task deadlines and snoozing.",
    profileErrorTitle: "Could not load the profile timezone",
    profileErrorDescription: "The queue is hidden to avoid showing an incorrect time.",
    configureProfile: "Configure profile",
    retry: "Retry"
  }
} as const;
