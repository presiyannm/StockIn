import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./client";

export const keys = {
  delivery: (id: number) => ["delivery", id] as const,
  deliveries: ["deliveries"] as const,
  products: ["products"] as const,
  suppliers: ["suppliers"] as const,
  stock: ["stock"] as const,
};

export const useDelivery = (id: number) =>
  useQuery({ queryKey: keys.delivery(id), queryFn: () => api.getDelivery(id), enabled: id > 0 });

export const useDeliveries = () => useQuery({ queryKey: keys.deliveries, queryFn: api.listDeliveries });
export const useProducts = () => useQuery({ queryKey: keys.products, queryFn: api.listProducts });
export const useSuppliers = () => useQuery({ queryKey: keys.suppliers, queryFn: api.listSuppliers });
export const useStock = () => useQuery({ queryKey: keys.stock, queryFn: api.listStock });

/**
 * Runs any API call for a delivery screen, shows its error as a toast and refetches
 * the delivery (and lists) afterwards, so screens always show saved data.
 */
export function useDeliveryAction(deliveryId: number) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.delivery(deliveryId) }),
        qc.invalidateQueries({ queryKey: keys.deliveries }),
        qc.invalidateQueries({ queryKey: keys.products }),
        qc.invalidateQueries({ queryKey: keys.stock }),
      ]),
  });
  return {
    /** Resolves to true on success, false on failure (already shown to the user). */
    run: async (fn: () => Promise<unknown>) => {
      try {
        await m.mutateAsync(fn);
        return true;
      } catch {
        return false;
      }
    },
    busy: m.isPending,
  };
}
