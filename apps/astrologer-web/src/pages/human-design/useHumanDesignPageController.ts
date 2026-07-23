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
  usePreviewHumanDesignMutation,
  useRecalculateHumanDesignCalculationMutation
} from "../../features/human-design/model/humanDesignHooks";
import {
  getActiveHumanDesignCalculations,
  toClientOptionFromHumanDesignCalculation,
  toHumanDesignCalculationResponse
} from "../../features/human-design/model/humanDesignSavedCalculationModel";
import type {
  HumanDesignPageStatus,
  HumanDesignPageViewProps,
  HumanDesignWorkspaceMode
} from "./HumanDesignPageView";

export function useHumanDesignPageController(): HumanDesignPageViewProps {
  useDocumentTitle("ElevenHouse | Дизайн человека");
  const listQuery = useHumanDesignCalculationListQuery();
  const previewMutation = usePreviewHumanDesignMutation();
  const createMutation = useCreateHumanDesignCalculationMutation();
  const recalculateMutation = useRecalculateHumanDesignCalculationMutation();
  const [mode, setMode] = useState<HumanDesignWorkspaceMode>("individual");
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [selectedPartnerClient, setSelectedPartnerClient] =
    useState<ClientSelectOption | null>(null);
  const [savedResponse, setSavedResponse] = useState<
    ReturnType<typeof toHumanDesignCalculationResponse> | null
  >(null);
  const [selectedDetailKey, setSelectedDetailKey] = useState<HumanDesignDetailKey>("type");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const calculations = useMemo(
    () => getActiveHumanDesignCalculations(listQuery.data?.calculations ?? [], mode),
    [listQuery.data?.calculations, mode]
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
  const isBusy =
    previewMutation.isPending || createMutation.isPending || recalculateMutation.isPending;
  const status = getHumanDesignStatus({
    mode,
    selectedClient,
    selectedPartnerClient,
    hasResult: Boolean(model),
    isLinked: Boolean(savedResponse),
    isBusy,
    errorMessage
  });

  return {
    mode,
    selectedClient,
    selectedPartnerClient,
    model,
    selectedDetailKey,
    calculations,
    selectedCalculationId: savedResponse?.calculation.id ?? null,
    status,
    errorMessage,
    isBusy,
    isLinked: Boolean(savedResponse),
    onSelectMode: (nextMode) => {
      setMode(nextMode);
      clearResultState(nextMode);
    },
    onSelectClient: (client) => {
      setSelectedClient(client);
      clearResultState(mode);
      if (mode === "individual" && client.hasBirthDate) void previewIndividual(client);
      if (mode === "compatibility" && client.hasBirthDate && selectedPartnerClient?.hasBirthDate) {
        void previewCompatibility(client, selectedPartnerClient);
      }
    },
    onSelectPartnerClient: (client) => {
      setSelectedPartnerClient(client);
      clearResultState("compatibility");
      if (mode === "compatibility" && selectedClient?.hasBirthDate && client.hasBirthDate) {
        void previewCompatibility(selectedClient, client);
      }
    },
    onSelectDetail: setSelectedDetailKey,
    onSelectSaved: (calculation) => {
      try {
        const response = toHumanDesignCalculationResponse(calculation);
        setMode(calculation.mode);
        setSavedResponse(response);
        setSelectedClient(toClientOptionFromHumanDesignCalculation(calculation, "subject"));
        setSelectedPartnerClient(toClientOptionFromHumanDesignCalculation(calculation, "partner"));
        setSelectedDetailKey(defaultDetailKey(calculation.mode));
        setErrorMessage(null);
        previewMutation.reset();
        createMutation.reset();
        recalculateMutation.reset();
      } catch {
        setErrorMessage("Сохранённый расчёт Human Design повреждён или устарел.");
      }
    },
    onPreview: () => {
      if (mode === "individual" && selectedClient) void previewIndividual(selectedClient);
      if (mode === "compatibility" && selectedClient && selectedPartnerClient) {
        void previewCompatibility(selectedClient, selectedPartnerClient);
      }
    },
    onPersist: () => {
      if (mode === "individual" && selectedClient && model) void persistIndividual(selectedClient);
      if (mode === "compatibility" && selectedClient && selectedPartnerClient && model) {
        void persistCompatibility(selectedClient, selectedPartnerClient);
      }
    },
    onRecalculate: () => {
      if (savedResponse) void recalculate(savedResponse.calculation.id);
    }
  };

  function clearResultState(nextMode: HumanDesignWorkspaceMode) {
    setSavedResponse(null);
    setSelectedDetailKey(defaultDetailKey(nextMode));
    setErrorMessage(null);
    previewMutation.reset();
    createMutation.reset();
    recalculateMutation.reset();
  }

  async function previewIndividual(client: ClientSelectOption) {
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
      recalculateMutation.reset();
      setSelectedDetailKey("type");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function previewCompatibility(subject: ClientSelectOption, partner: ClientSelectOption) {
    const validationError = validateCompatibilityClients(subject, partner);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    setErrorMessage(null);
    try {
      await previewMutation.mutateAsync({
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: subject.value,
        partnerClientId: partner.value
      });
      setSavedResponse(null);
      createMutation.reset();
      recalculateMutation.reset();
      setSelectedDetailKey("compatibility:summary");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function persistIndividual(client: ClientSelectOption) {
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
      recalculateMutation.reset();
      setSelectedDetailKey("type");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function persistCompatibility(subject: ClientSelectOption, partner: ClientSelectOption) {
    if (!model) return;
    const validationError = validateCompatibilityClients(subject, partner);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    setErrorMessage(null);
    try {
      const response = await createMutation.mutateAsync({
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: subject.value,
        partnerClientId: partner.value
      });
      setSavedResponse(response);
      previewMutation.reset();
      recalculateMutation.reset();
      setSelectedDetailKey("compatibility:summary");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function recalculate(calculationId: string) {
    setErrorMessage(null);
    try {
      const response = await recalculateMutation.mutateAsync({ calculationId });
      setMode(response.calculation.mode);
      setSavedResponse(response);
      setSelectedClient(toClientOptionFromHumanDesignCalculation(response.calculation, "subject"));
      setSelectedPartnerClient(
        toClientOptionFromHumanDesignCalculation(response.calculation, "partner")
      );
      previewMutation.reset();
      createMutation.reset();
      setSelectedDetailKey(defaultDetailKey(response.calculation.mode));
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }
}

function getHumanDesignStatus(input: {
  readonly mode: HumanDesignWorkspaceMode;
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
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
      title: input.mode === "compatibility" ? "Партнёрский расчёт привязан" : "Расчёт привязан",
      detail:
        input.mode === "compatibility"
          ? "Human Design сохранён для пары клиентов."
          : "Human Design сохранён в расчётах клиента."
    };
  }
  if (input.hasResult) {
    return {
      tone: "success",
      title: input.mode === "compatibility" ? "Партнёрский разбор рассчитан" : "Бодиграф рассчитан",
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
  if (input.mode === "compatibility") {
    const partner = input.selectedPartnerClient;
    if (!partner) {
      return {
        tone: "empty",
        title: "Выберите партнёра",
        detail: "Партнёрский режим требует второго CRM клиента."
      };
    }
    if (!partner.hasBirthDate) {
      return {
        tone: "warning",
        title: "У партнёра нет даты рождения",
        detail: "Заполните birth data в карточке партнёра."
      };
    }
    if (partner.value === input.selectedClient.value) {
      return {
        tone: "warning",
        title: "Нужны два разных клиента",
        detail: "Партнёрский разбор не рассчитывается для одного и того же клиента."
      };
    }
  }

  return {
    tone: "ready",
    title: input.mode === "compatibility" ? "Пара выбрана" : "Клиент выбран",
    detail:
      input.mode === "compatibility"
        ? "Можно рассчитать партнёрский preview."
        : "Можно рассчитать individual preview."
  };
}

function validateCompatibilityClients(
  subject: ClientSelectOption,
  partner: ClientSelectOption
): string | null {
  if (!subject.hasBirthDate) return "В карточке клиента не заполнена дата рождения.";
  if (!partner.hasBirthDate) return "В карточке партнёра не заполнена дата рождения.";
  if (subject.value === partner.value) {
    return "Для партнёрского разбора выберите двух разных клиентов.";
  }
  return null;
}

function defaultDetailKey(mode: HumanDesignWorkspaceMode): HumanDesignDetailKey {
  return mode === "compatibility" ? "compatibility:summary" : "type";
}

function getHumanDesignErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Не удалось рассчитать Human Design.";
}
