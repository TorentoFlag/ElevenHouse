import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult
} from "@tanstack/react-query";
import { logout } from "../api/logout";
import { authQueryKeys } from "./authQueryKeys";

export function logoutMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(authQueryKeys.currentAccount(), null);
    }
  };
}

export function useLogoutMutation(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation(logoutMutationOptions(queryClient));
}
