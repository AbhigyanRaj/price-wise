import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, queryString, type Paged } from "@/lib/api";
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

export type { Paged };
