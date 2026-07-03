import { useReducer } from "react";
import type { ProductResponse, ProductType } from "@elevenhouse/contracts";
import {
  createDefaultProductDraft,
  createProductDraftFromResponse,
  toCreateProductRequest,
  toUpdateProductRequest,
  type ProductFormDraft
} from "../../../features/products/model/productDraft";
import { useCreateProductMutation } from "../../../features/products/model/useCreateProductMutation";
import { useUpdateProductMutation } from "../../../features/products/model/useUpdateProductMutation";

type ProductCreateFlowState = {
  readonly isTypeModalOpen: boolean;
  readonly editorDraft: ProductFormDraft | null;
  readonly editingProductId: string | null;
  readonly editorError: string | null;
};

type ProductCreateFlowAction =
  | { readonly type: "openTypeSelection" }
  | { readonly type: "closeTypeSelection" }
  | { readonly type: "selectType"; readonly productType: ProductType }
  | { readonly type: "editProduct"; readonly product: ProductResponse }
  | { readonly type: "updateDraft"; readonly draft: ProductFormDraft }
  | { readonly type: "saveStarted" }
  | { readonly type: "saveSucceeded" }
  | { readonly type: "saveFailed"; readonly error: string }
  | { readonly type: "closeEditor" }
  | { readonly type: "returnToTypeSelection" }
  | { readonly type: "closeCreateFlow" };

const initialProductCreateFlowState: ProductCreateFlowState = {
  isTypeModalOpen: false,
  editorDraft: null,
  editingProductId: null,
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
  readonly editProduct: (product: ProductResponse) => void;
  readonly updateDraft: (draft: ProductFormDraft) => void;
  readonly saveDraft: () => Promise<void>;
  readonly closeEditor: () => void;
  readonly returnToTypeSelection: () => void;
  readonly closeCreateFlow: () => void;
};

export function useProductCreateFlow(genericError: string): ProductCreateFlow {
  const [state, dispatch] = useReducer(
    productCreateFlowReducer,
    initialProductCreateFlowState
  );
  const createProductMutation = useCreateProductMutation();
  const updateProductMutation = useUpdateProductMutation();
  const isSaving = createProductMutation.isPending || updateProductMutation.isPending;

  return {
    ...state,
    isSaving,
    openTypeSelection: () => dispatch({ type: "openTypeSelection" }),
    closeTypeSelection: () => dispatch({ type: "closeTypeSelection" }),
    selectType: (type) => dispatch({ type: "selectType", productType: type }),
    editProduct: (product) => dispatch({ type: "editProduct", product }),
    updateDraft: (draft) => dispatch({ type: "updateDraft", draft }),
    saveDraft: async () => {
      if (isSaving || !state.editorDraft?.title.trim()) {
        return;
      }

      dispatch({ type: "saveStarted" });

      try {
        if (state.editingProductId) {
          await updateProductMutation.mutateAsync({
            productId: state.editingProductId,
            body: toUpdateProductRequest(state.editorDraft)
          });
        } else {
          await createProductMutation.mutateAsync(toCreateProductRequest(state.editorDraft));
        }
        dispatch({ type: "saveSucceeded" });
      } catch {
        dispatch({ type: "saveFailed", error: genericError });
      }
    },
    closeEditor: () => {
      if (!isSaving) {
        dispatch({ type: "closeEditor" });
      }
    },
    returnToTypeSelection: () => {
      if (!isSaving) {
        dispatch({ type: "returnToTypeSelection" });
      }
    },
    closeCreateFlow: () => {
      if (!isSaving) {
        dispatch({ type: "closeCreateFlow" });
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
      editingProductId: null,
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
      editingProductId: null,
      editorError: null
    };
  }

  if (action.type === "editProduct") {
    return {
      isTypeModalOpen: false,
      editorDraft: createProductDraftFromResponse(action.product),
      editingProductId: action.product.id,
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
      editingProductId: null,
      editorError: null
    };
  }

  if (action.type === "saveFailed") {
    return {
      ...state,
      editorError: action.error
    };
  }

  if (action.type === "returnToTypeSelection") {
    return {
      isTypeModalOpen: true,
      editorDraft: null,
      editingProductId: null,
      editorError: null
    };
  }

  if (action.type === "closeCreateFlow") {
    return initialProductCreateFlowState;
  }

  return {
    ...state,
    editorDraft: null,
    editingProductId: null,
    editorError: null
  };
}
