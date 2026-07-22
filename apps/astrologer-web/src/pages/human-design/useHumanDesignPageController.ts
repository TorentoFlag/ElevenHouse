import { useMemo, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import {
  createHumanDesignViewModel,
  type HumanDesignDetailKey
} from "../../features/human-design/model/humanDesignViewModel";
import {
  useCreateHumanDesignCalculationMutation,
  useHumanDesignCalculationListQuery,
  usePreviewHumanDesignMutation
} from "../../features/human-design/model/humanDesignHooks";
import {
  getActiveHumanDesignCalculations,
  toClientOptionFromHumanDesignCalculation,
  toHumanDesignCalculationResponse
} from "../../features/human-design/model/humanDesignSavedCalculationModel";
import type { HumanDesignPageStatus, HumanDesignPageViewProps } from "./HumanDesignPageView";

export function useHumanDesignPageController(): HumanDesignPageViewProps {
  useDocumentTitle("ElevenHouse | Дизайн человека");
  const listQuery = useHumanDesignCalculationListQuery();
  const previewMutation = usePreviewHumanDesignMutation();
  const createMutation = useCreateHumanDesignCalculationMutation();
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [savedResponse, setSavedResponse] = useState<
    ReturnType<typeof toHumanDesignCalculationResponse> | null
  >(null);
  const [selectedDetailKey, setSelectedDetailKey] = useState<HumanDesignDetailKey>("type");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const calculations = useMemo(
    () => getActiveHumanDesignCalculations(listQuery.data?.calculations ?? []),
    [listQuery.data?.calculations]
  );
  const model = useMemo(
    () =>
      savedResponse
        ? createHumanDesignViewModel(savedResponse.result)
        : previewMutation.data
          ? createHumanDesignViewModel(previewMutation.data.result)
          : null,
    [previewMutation.data, savedResponse]
  );
  const status = getHumanDesignStatus({
    selectedClient,
    hasResult: Boolean(model),
    isLinked: Boolean(savedResponse),
    isBusy: previewMutation.isPending || createMutation.isPending,
    errorMessage
  });

  return {
    selectedClient,
    model,
    selectedDetailKey,
    calculations,
    selectedCalculationId: savedResponse?.calculation.id ?? null,
    status,
    errorMessage,
    isBusy: previewMutation.isPending || createMutation.isPending,
    isLinked: Boolean(savedResponse),
    onSelectClient: (client) => {
      setSelectedClient(client);
      setSavedResponse(null);
      setSelectedDetailKey("type");
      setErrorMessage(null);
      previewMutation.reset();
      createMutation.reset();
      if (client.hasBirthDate) void preview(client);
    },
    onSelectDetail: setSelectedDetailKey,
    onSelectSaved: (calculation) => {
      try {
        const response = toHumanDesignCalculationResponse(calculation);
        setSavedResponse(response);
        setSelectedClient(toClientOptionFromHumanDesignCalculation(calculation));
        setSelectedDetailKey("type");
        setErrorMessage(null);
        previewMutation.reset();
        createMutation.reset();
      } catch {
        setErrorMessage("Сохранённый расчёт Human Design повреждён или устарел.");
      }
    },
    onPreview: () => {
      if (selectedClient) void preview(selectedClient);
    },
    onPersist: () => {
      if (selectedClient && model) void persist(selectedClient);
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
      setSavedResponse(null);
      createMutation.reset();
      setSelectedDetailKey("type");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function persist(client: ClientSelectOption) {
    if (!model) return;
    setErrorMessage(null);
    try {
      const response = await createMutation.mutateAsync({
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: client.value
      });
      setSavedResponse(response);
      previewMutation.reset();
      setSelectedDetailKey("type");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }
}

function getHumanDesignStatus(input: {
  readonly selectedClient: ClientSelectOption | null;
  readonly hasResult: boolean;
  readonly isLinked: boolean;
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
  if (input.isLinked) {
    return {
      tone: "success",
      title: "Расчёт привязан",
      detail: "Human Design сохранён в расчётах клиента."
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
