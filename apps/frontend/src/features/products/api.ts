import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, queryString, type Paged } from "@/lib/api";
import type { ProductInput, ProductPatch } from "@pricewise/shared";
import type { ProductDto } from "@/lib/types";

export interface CatalogFilters {
  search: string;
  category: string;
  inventoryStatus: string;
  sortBy: "name" | "currentPrice" | "inventoryLevel" | "updatedAt";
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  search: "",
  category: "",
  inventoryStatus: "",
  sortBy: "updatedAt",
  sortDir: "desc",
  page: 1,
  pageSize: 20,
};

export function useProducts(filters: CatalogFilters) {
  return useQuery({
    // Filters are part of the key, so each filtered view caches independently
    // and going back to a previous filter is instant.
    queryKey: ["products", filters],
    queryFn: ({ signal }) =>
      api.paged<ProductDto>(`/products${queryString({ ...filters })}`, signal),
    // Without this the table unmounts its rows and flashes empty on every page
    // change, which reads as a much slower app than it is. v5 renamed this
    // from the old keepPreviousData boolean.
    placeholderData: keepPreviousData,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["products", "categories"],
    queryFn: ({ signal }) => api.get<string[]>("/products/categories", signal),
    staleTime: 5 * 60_000,
  });
}

export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: ["products", productId],
    queryFn: ({ signal }) => api.get<ProductDto>(`/products/${productId}`, signal),
    enabled: Boolean(productId),
  });
}

/**
 * Every product write invalidates the same two prefixes.
 *
 * ["products"] covers the list, the detail and the category list, because they
 * all share it. ["audit"] is included because every write records an audit
 * row, and the Activity screen would otherwise show a stale trail.
 *
 * NOT ["recommendations"]: editing a product does not retroactively change a
 * recommendation that was already made against the old numbers.
 */
function invalidateProducts(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["products"] }),
    queryClient.invalidateQueries({ queryKey: ["audit"] }),
  ]);
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) => api.post<ProductDto>("/products", input),
    // Deliberately not optimistic. A created product lands at an unknown
    // position under the current sort and page, so an optimistic insert would
    // put it somewhere it is not. useApprove is optimistic because a row
    // LEAVING a list is unambiguous; a row arriving is not.
    onSettled: () => invalidateProducts(queryClient),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductPatch }) =>
      api.patch<ProductDto>(`/products/${id}`, patch),
    onSettled: () => invalidateProducts(queryClient),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    // Pessimistic on purpose: destructive, rare, and it cascades to the
    // product's recommendation history.
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSettled: () => invalidateProducts(queryClient),
  });
}

export type { Paged };
