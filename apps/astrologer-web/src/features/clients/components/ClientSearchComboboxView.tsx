import { Icon } from "@elevenhouse/design-system/icons/Icon";
import {
  getClientSearchComboboxKeyAction,
  type ClientSelectOption
} from "../model/clientSelectorModel";
import styles from "./ClientSearchCombobox.module.css";

export type ClientSearchComboboxViewProps = {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly selectedClient: ClientSelectOption | null;
  readonly clients: readonly ClientSelectOption[];
  readonly searchQuery: string;
  readonly isOpen: boolean;
  readonly isInitialLoading: boolean;
  readonly isSearching: boolean;
  readonly isFetchingNextPage: boolean;
  readonly hasNextPage: boolean;
  readonly activeClientId: string | null;
  readonly errorMessage: string | null;
  readonly disabled?: boolean;
  readonly requireBirthDate?: boolean;
  readonly fullWidth?: boolean;
  readonly loadMoreRef?: (node: HTMLDivElement | null) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onSearchChange: (value: string) => void;
  readonly onSelect: (client: ClientSelectOption) => void;
  readonly onActiveClientChange: (clientId: string | null) => void;
  readonly onLoadMore: () => void;
};

export function ClientSearchComboboxView({
  id,
  label,
  placeholder,
  selectedClient,
  clients,
  searchQuery,
  isOpen,
  isInitialLoading,
  isSearching,
  isFetchingNextPage,
  hasNextPage,
  activeClientId,
  errorMessage,
  disabled = false,
  requireBirthDate = true,
  fullWidth = false,
  loadMoreRef,
  onOpenChange,
  onSearchChange,
  onSelect,
  onActiveClientChange,
  onLoadMore
}: ClientSearchComboboxViewProps) {
  const listboxId = `${id}-listbox`;
  const activeOptionId = activeClientId ? `${id}-option-${activeClientId}` : undefined;

  return (
    <div className={styles.root} data-full-width={fullWidth ? "true" : undefined}>
      <span className={styles.floatingLabel}>{label}</span>
      <button
        type="button"
        role="combobox"
        className={styles.trigger}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenChange(true);
          }
        }}
      >
        <span className={styles.avatar}>{selectedClient?.initials ?? "К"}</span>
        <span className={styles.triggerText}>
          <strong>{selectedClient?.label ?? placeholder}</strong>
          <small>{selectedClient?.birthDateDisplay ?? "дата рождения"}</small>
        </span>
        <span className={styles.chevron} data-open={isOpen ? "true" : undefined} aria-hidden="true">
          <Icon iconName="chevronDown" width={15} height={15} />
        </span>
      </button>
      {isOpen ? (
        <>
          <button
            type="button"
            className={styles.scrim}
            aria-label="Закрыть выбор клиента"
            onClick={() => onOpenChange(false)}
          />
          <div className={styles.popup}>
            <div className={styles.searchShell}>
              <span className={styles.searchIcon} aria-hidden="true">
                <Icon iconName="search" width={14} height={14} />
              </span>
              <input
                role="combobox"
                className={styles.searchInput}
                aria-controls={listboxId}
                aria-expanded="true"
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
                autoFocus
                value={searchQuery}
                placeholder="Поиск по клиентам..."
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  const action = getClientSearchComboboxKeyAction({
                    key: event.key,
                    clients,
                    activeClientId,
                    hasNextPage,
                    requireBirthDate
                  });
                  if (action.kind === "ignore") return;

                  event.preventDefault();
                  if (action.kind === "close") {
                    onOpenChange(false);
                  } else if (action.kind === "activate") {
                    onActiveClientChange(action.clientId);
                  } else if (action.kind === "select") {
                    onSelect(action.client);
                  } else if (action.kind === "load-more") {
                    onLoadMore();
                  }
                }}
              />
            </div>
            <div className={styles.list} id={listboxId} role="listbox" aria-label={label}>
              {isInitialLoading ? <div className={styles.status}>Загружаем клиентов...</div> : null}
              {!isInitialLoading && clients.length === 0 ? (
                <div className={styles.status}>
                  {searchQuery.trim() ? "Ничего не найдено" : "Клиентов пока нет"}
                </div>
              ) : null}
              {clients.map((client) => {
                const isSelected = selectedClient?.value === client.value;
                const isActive = activeClientId === client.value;

                return (
                  <button
                    type="button"
                    role="option"
                    id={`${id}-option-${client.value}`}
                    aria-selected={isSelected}
                    className={styles.option}
                    data-active={isActive ? "true" : undefined}
                    data-selected={isSelected ? "true" : undefined}
                    disabled={requireBirthDate && !client.hasBirthDate}
                    key={client.value}
                    onMouseEnter={() => onActiveClientChange(client.value)}
                    onClick={() => {
                      if (!requireBirthDate || client.hasBirthDate) {
                        onSelect(client);
                      }
                    }}
                  >
                    <span className={styles.optionAvatar}>{client.initials}</span>
                    <span className={styles.optionText}>
                      <strong>{client.label}</strong>
                      <small>{client.subtitle}</small>
                    </span>
                    {isSelected ? <span className={styles.check}>✓</span> : null}
                  </button>
                );
              })}
              {errorMessage ? <div className={styles.status}>{errorMessage}</div> : null}
              <div className={styles.loadMore} ref={loadMoreRef}>
                {isFetchingNextPage ? "Загружаем еще клиентов..." : null}
                {isSearching && !isFetchingNextPage ? "Обновляем поиск..." : null}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
