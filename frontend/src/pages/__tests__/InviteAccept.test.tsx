import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import InviteAccept from "@/pages/InviteAccept";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("@/providers/trpc", () => ({
  trpc: {
    group: {
      acceptInvitation: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      declineInvitation: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

describe("InviteAccept", () => {
  it("shows invalid state when token is missing", () => {
    render(
      <MemoryRouter initialEntries={["/invite"]}>
        <InviteAccept />
      </MemoryRouter>,
    );

    expect(screen.getByText("Invalid invitation")).toBeInTheDocument();
  });

  it("renders accept UI when token is present", () => {
    render(
      <MemoryRouter initialEntries={["/invite?token=abc"]}>
        <InviteAccept />
      </MemoryRouter>,
    );

    expect(screen.getByText("Accept invitation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });
});
