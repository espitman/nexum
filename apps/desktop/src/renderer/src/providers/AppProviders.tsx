import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "../router";
import { ThemeProvider } from "./ThemeProvider";
import { queryClient } from "./queryClient";

export const AppProviders = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </QueryClientProvider>
);
