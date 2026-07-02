import { useReducer } from "react";
import type { ProductType } from "@elevenhouse/contracts";
import {
  createDefaultProductDraft,
  toCreateProductRequest,
  type ProductFormDraft
} from "../../../features/products/model/productDraft";
import { useCreateProductMutation } from "../../../features/products/model/useCreateProductMutation";

type ProductCreateFlowState = {
  readonly isTypeModalOpen: boolean;
  readonly editorDraft: ProductFormDraft | null;
  readonly editorError: string | null;
};

type ProductCreateFlowAction =
  | { readonly type: "openTypeSelection" }
  | { readonly type: "closeTypeSelection" }
  | { readonly type: "selectType"; readonly productType: ProductType }
  | { readonly type: "updateDraft"; readonly draft: ProductFormDraft }
  | { readonly type: "saveStarted" }
  | { readonly type: "saveSucceeded" }
  | { readonly type: "saveFailed"; readonly error: string }
  | { readonly type: "closeEditor" };

const initialProductCreateFlowState: ProductCreateFlowState = {
  isTypeModalOpen: false,
  editorDraft: null,
  editorError: null
};

export type ProductCreateFlow = {
  readonly isTypeModalOpen: boolean;
  readonly editorDraft: ProductFormDraft | null;
  readonly editorError: string | null;
  readonly isSaving: boolean;
  readonly openTypeSelection: () => void;
  readonly closeTypeSelection: () => void;
  readonly selectType: (type: ProductType) => void;
  readonly updateDraft: (draft: ProductFormDraft) => void;
  readonly saveDraft: () => Promise<void>;
  readonly closeEditor: () => void;
};

export function useProductCreateFlow(genericError: string): ProductCreateFlow {
  const [state, dispatch] = useReducer(
    productCreateFlowReducer,
    initialProductCreateFlowState
  );
  const createProductMutation = useCreateProductMutation();

  return {
    ...state,
    isSaving: createProductMutation.isPending,
    openTypeSelection: () => dispatch({ type: "openTypeSelection" }),
    closeTypeSelection: () => dispatch({ type: "closeTypeSelection" }),
    selectType: (type) => dispatch({ type: "selectType", productType: type }),
    updateDraft: (draft) => dispatch({ type: "updateDraft", draft }),
    saveDraft: async () => {
      if (createProductMutation.isPending || !state.editorDraft?.title.trim()) {
        return;
      }

      dispatch({ type: "saveStarted" });

      try {
        await createProductMutation.mutateAsync(toCreateProductRequest(state.editorDraft));
        dispatch({ type: "saveSucceeded" });
      } catch {
        dispatch({ type: "saveFailed", error: genericError });
      }
    },
    closeEditor: () => {
      if (!createProductMutation.isPending) {
        dispatch({ type: "closeEditor" });
      }
    }
  };
}

function productCreateFlowReducer(
  state: ProductCreateFlowState,
  action: ProductCreateFlowAction
): ProductCreateFlowState {
  if (action.type === "openTypeSelection") {
    return {
      ...state,
      isTypeModalOpen: true,
      editorError: null
    };
  }

  if (action.type === "closeTypeSelection") {
    return {
      ...state,
      isTypeModalOpen: false
    };
  }

  if (action.type === "selectType") {
    return {
      isTypeModalOpen: false,
      editorDraft: createDefaultProductDraft(action.productType),
      editorError: null
    };
  }

  if (action.type === "updateDraft") {
    return {
      ...state,
      editorDraft: action.draft,
      editorError: null
    };
  }

  if (action.type === "saveStarted") {
    return {
      ...state,
      editorError: null
    };
  }

  if (action.type === "saveSucceeded") {
    return {
      ...state,
      editorDraft: null,
      editorError: null
    };
  }

  if (action.type === "saveFailed") {
    return {
      ...state,
      editorError: action.error
    };
  }

  return {
    ...state,
    editorDraft: null,
    editorError: null
  };
}
