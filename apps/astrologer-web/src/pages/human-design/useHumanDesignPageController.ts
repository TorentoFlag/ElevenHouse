import { useMemo, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import {
  createHumanDesignViewModel,
  type HumanDesignDetailKey
} from "../../features/human-design/model/humanDesignViewModel";
import { usePreviewHumanDesignMutation } from "../../features/human-design/model/humanDesignHooks";
import type { HumanDesignPageStatus, HumanDesignPageViewProps } from "./HumanDesignPageView";

export function useHumanDesignPageController(): HumanDesignPageViewProps {
  useDocumentTitle("ElevenHouse | Дизайн человека");
  const previewMutation = usePreviewHumanDesignMutation();
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [selectedDetailKey, setSelectedDetailKey] = useState<HumanDesignDetailKey>("type");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const model = useMemo(
    () => (previewMutation.data ? createHumanDesignViewModel(previewMutation.data.result) : null),
    [previewMutation.data]
  );
  const status = getHumanDesignStatus({
    selectedClient,
    hasResult: Boolean(model),
    isBusy: previewMutation.isPending,
    errorMessage
  });

  return {
    selectedClient,
    model,
    selectedDetailKey,
    status,
    errorMessage,
    isBusy: previewMutation.isPending,
    onSelectClient: (client) => {
      setSelectedClient(client);
      setSelectedDetailKey("type");
      setErrorMessage(null);
      previewMutation.reset();
      if (client.hasBirthDate) void preview(client);
    },
    onSelectDetail: setSelectedDetailKey,
    onPreview: () => {
      if (selectedClient) void preview(selectedClient);
    }
  };

  async function preview(client: ClientSelectOption) {
    if (!client.hasBirthDate) {
      setErrorMessage("В карточке клиента не заполнена дата рождения.");
      return;
    }
    setErrorMessage(null);
    try {
      await previewMutation.mutateAsync({
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: client.value
      });
      setSelectedDetailKey("type");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }
}

function getHumanDesignStatus(input: {
  readonly selectedClient: ClientSelectOption | null;
  readonly hasResult: boolean;
  readonly isBusy: boolean;
  readonly errorMessage: string | null;
}): HumanDesignPageStatus {
  if (input.errorMessage) {
    return {
      tone: "error",
      title: "Расчёт не выполнен",
      detail: input.errorMessage
    };
  }
  if (input.isBusy) {
    return {
      tone: "busy",
      title: "Расчёт Human Design",
      detail: "Запрашиваем chart-engine через backend."
    };
  }
  if (input.hasResult) {
    return {
      tone: "success",
      title: "Бодиграф рассчитан",
      detail: "Механика пришла из server/domain engine."
    };
  }
  if (!input.selectedClient) {
    return {
      tone: "empty",
      title: "Выберите клиента",
      detail: "Birth data берутся из карточки клиента."
    };
  }
  if (!input.selectedClient.hasBirthDate) {
    return {
      tone: "warning",
      title: "Нет даты рождения",
      detail: "Заполните birth data в карточке клиента."
    };
  }

  return {
    tone: "ready",
    title: "Клиент выбран",
    detail: "Можно рассчитать individual preview."
  };
}

function getHumanDesignErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Не удалось рассчитать Human Design.";
}
