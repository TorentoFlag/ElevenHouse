import { useReducer } from "react";
import type {
  ProductIncludedItemRequest,
  ProductResponse,
  ProductType
} from "@elevenhouse/contracts";
import {
  createDefaultProductDraft,
  createProductDraftFromResponse,
  type ProductFormDraft
} from "../../../features/products/model/productDraft";
import { persistProductDraft } from "../../../features/products/model/productCreateFlowPersistence";
import { uploadMediaFile } from "../../../features/media/api/uploadMediaFile";
import { useCreateProductMutation } from "../../../features/products/model/useCreateProductMutation";
import { usePublishProductMutation } from "../../../features/products/model/usePublishProductMutation";
import { useUpdateProductMutation } from "../../../features/products/model/useUpdateProductMutation";

type ProductCreateFlowState = {
  readonly isTypeModalOpen: boolean;
  readonly editorDraft: ProductFormDraft | null;
  readonly editingProductId: string | null;
  readonly editorError: string | null;
  readonly coverMediaUrl: string | null;
  readonly isCoverUploading: boolean;
  readonly coverUploadError: string | null;
};

type ProductCreateFlowAction =
  | { readonly type: "openTypeSelection" }
  | { readonly type: "closeTypeSelection" }
  | { readonly type: "selectType"; readonly productType: ProductType }
  | { readonly type: "editProduct"; readonly product: ProductResponse }
  | { readonly type: "updateDraft"; readonly draft: ProductFormDraft }
  | { readonly type: "saveStarted" }
  | { readonly type: "saveSucceeded" }
  | {
      readonly type: "saveFailedWithPersistedProduct";
      readonly product: ProductResponse;
      readonly error: string;
    }
  | { readonly type: "saveFailed"; readonly error: string }
  | { readonly type: "coverUploadStarted"; readonly previewUrl: string | null }
  | { readonly type: "coverUploadSucceeded"; readonly mediaId: string; readonly url: string }
  | {
      readonly type: "coverUploadFailed";
      readonly error: string;
      readonly previousUrl: string | null;
    }
  | { readonly type: "removeCover" }
  | { readonly type: "closeEditor" }
  | { readonly type: "returnToTypeSelection" }
  | { readonly type: "closeCreateFlow" };

const initialProductCreateFlowState: ProductCreateFlowState = {
  isTypeModalOpen: false,
  editorDraft: null,
  editingProductId: null,
  editorError: null,
  coverMediaUrl: null,
  isCoverUploading: false,
  coverUploadError: null
};

export type ProductCreateFlow = {
  readonly isTypeModalOpen: boolean;
  readonly editorDraft: ProductFormDraft | null;
  readonly editorError: string | null;
  readonly coverMediaUrl: string | null;
  readonly isCoverUploading: boolean;
  readonly coverUploadError: string | null;
  readonly isSaving: boolean;
  readonly openTypeSelection: () => void;
  readonly closeTypeSelection: () => void;
  readonly selectType: (type: ProductType) => void;
  readonly editProduct: (product: ProductResponse) => void;
  readonly updateDraft: (draft: ProductFormDraft) => void;
  readonly uploadProductCover: (file: File) => Promise<void>;
  readonly removeProductCover: () => void;
  readonly saveDraft: (
    visibleIncludedItems?: readonly ProductIncludedItemRequest[]
  ) => Promise<void>;
  readonly publishDraft: (
    visibleIncludedItems?: readonly ProductIncludedItemRequest[]
  ) => Promise<void>;
  readonly closeEditor: () => void;
  readonly returnToTypeSelection: () => void;
  readonly closeCreateFlow: () => void;
};

export function useProductCreateFlow(genericError: string): ProductCreateFlow {
  const [state, dispatch] = useReducer(productCreateFlowReducer, initialProductCreateFlowState);
  const createProductMutation = useCreateProductMutation();
  const updateProductMutation = useUpdateProductMutation();
  const publishProductMutation = usePublishProductMutation();
  const isSaving =
    createProductMutation.isPending ||
    updateProductMutation.isPending ||
    publishProductMutation.isPending;
  const persistDraft = async (
    publish: boolean,
    visibleIncludedItems?: readonly ProductIncludedItemRequest[]
  ) => {
    if (isSaving || state.isCoverUploading || !state.editorDraft?.title.trim()) {
      return;
    }

    dispatch({ type: "saveStarted" });

    const result = await persistProductDraft({
      draft: state.editorDraft,
      visibleIncludedItems,
      editingProductId: state.editingProductId,
      publish,
      createProduct: createProductMutation.mutateAsync,
      updateProduct: updateProductMutation.mutateAsync,
      publishProduct: publishProductMutation.mutateAsync
    });

    if (result.status === "saved") {
      dispatch({ type: "saveSucceeded" });
      return;
    }

    if (result.persistedProduct) {
      dispatch({
        type: "saveFailedWithPersistedProduct",
        product: result.persistedProduct,
        error: genericError
      });
      return;
    }

    dispatch({ type: "saveFailed", error: genericError });
  };
  const uploadProductCover = async (file: File) => {
    if (!state.editorDraft || state.isCoverUploading) {
      return;
    }

    const previousUrl = state.coverMediaUrl;
    const previewUrl = createLocalObjectUrl(file);

    dispatch({ type: "coverUploadStarted", previewUrl });

    try {
      const media = await uploadMediaFile({
        purpose: "product_cover",
        file
      });
      dispatch({ type: "coverUploadSucceeded", mediaId: media.id, url: media.url });
    } catch {
      dispatch({ type: "coverUploadFailed", error: genericError, previousUrl });
    } finally {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    }
  };

  return {
    ...state,
    isSaving,
    openTypeSelection: () => dispatch({ type: "openTypeSelection" }),
    closeTypeSelection: () => dispatch({ type: "closeTypeSelection" }),
    selectType: (type) => dispatch({ type: "selectType", productType: type }),
    editProduct: (product) => dispatch({ type: "editProduct", product }),
    updateDraft: (draft) => dispatch({ type: "updateDraft", draft }),
    uploadProductCover,
    removeProductCover: () => dispatch({ type: "removeCover" }),
    saveDraft: (visibleIncludedItems) => persistDraft(false, visibleIncludedItems),
    publishDraft: (visibleIncludedItems) => persistDraft(true, visibleIncludedItems),
    closeEditor: () => {
      if (!isSaving && !state.isCoverUploading) {
        dispatch({ type: "closeEditor" });
      }
    },
    returnToTypeSelection: () => {
      if (!isSaving && !state.isCoverUploading) {
        dispatch({ type: "returnToTypeSelection" });
      }
    },
    closeCreateFlow: () => {
      if (!isSaving && !state.isCoverUploading) {
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
      editorDraft: null,
      editingProductId: null,
      editorError: null,
      coverMediaUrl: null,
      isCoverUploading: false,
      coverUploadError: null
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
      editorError: null,
      coverMediaUrl: null,
      isCoverUploading: false,
      coverUploadError: null
    };
  }

  if (action.type === "editProduct") {
    return {
      isTypeModalOpen: false,
      editorDraft: createProductDraftFromResponse(action.product),
      editingProductId: action.product.id,
      editorError: null,
      coverMediaUrl: action.product.coverMedia?.url ?? null,
      isCoverUploading: false,
      coverUploadError: null
    };
  }

  if (action.type === "updateDraft") {
    return {
      ...state,
      editorDraft: action.draft,
      editorError: null,
      coverUploadError: null
    };
  }

  if (action.type === "saveStarted") {
    return {
      ...state,
      editorError: null
    };
  }

  if (action.type === "coverUploadStarted") {
    return {
      ...state,
      coverMediaUrl: action.previewUrl ?? state.coverMediaUrl,
      isCoverUploading: true,
      coverUploadError: null,
      editorError: null
    };
  }

  if (action.type === "coverUploadSucceeded") {
    if (!state.editorDraft) {
      return {
        ...state,
        isCoverUploading: false,
        coverUploadError: null
      };
    }

    return {
      ...state,
      editorDraft: {
        ...state.editorDraft,
        coverMediaId: action.mediaId
      },
      coverMediaUrl: action.url,
      isCoverUploading: false,
      coverUploadError: null
    };
  }

  if (action.type === "coverUploadFailed") {
    return {
      ...state,
      coverMediaUrl: action.previousUrl,
      isCoverUploading: false,
      coverUploadError: action.error
    };
  }

  if (action.type === "removeCover") {
    if (!state.editorDraft || state.isCoverUploading) {
      return state;
    }

    return {
      ...state,
      editorDraft: {
        ...state.editorDraft,
        coverMediaId: ""
      },
      coverMediaUrl: null,
      coverUploadError: null
    };
  }

  if (action.type === "saveSucceeded") {
    return {
      ...state,
      editorDraft: null,
      editingProductId: null,
      editorError: null,
      coverMediaUrl: null,
      isCoverUploading: false,
      coverUploadError: null
    };
  }

  if (action.type === "saveFailed") {
    return {
      ...state,
      editorError: action.error
    };
  }

  if (action.type === "saveFailedWithPersistedProduct") {
    return {
      ...state,
      editorDraft: createProductDraftFromResponse(action.product),
      editingProductId: action.product.id,
      editorError: action.error,
      coverMediaUrl: null,
      isCoverUploading: false,
      coverUploadError: null
    };
  }

  if (action.type === "returnToTypeSelection") {
    return {
      isTypeModalOpen: true,
      editorDraft: null,
      editingProductId: null,
      editorError: null,
      coverMediaUrl: null,
      isCoverUploading: false,
      coverUploadError: null
    };
  }

  if (action.type === "closeCreateFlow") {
    return initialProductCreateFlowState;
  }

  return {
    ...state,
    editorDraft: null,
    editingProductId: null,
    editorError: null,
    coverMediaUrl: null,
    isCoverUploading: false,
    coverUploadError: null
  };
}

function createLocalObjectUrl(file: File): string | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }

  return URL.createObjectURL(file);
}
