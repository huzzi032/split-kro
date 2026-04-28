import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Notifications from "@/pages/Notifications";

const invalidateMock = vi.fn();

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({
      notification: {
        list: { invalidate: invalidateMock },
        unreadCount: { invalidate: invalidateMock },
      },
      group: {
        listPendingInvitations: { invalidate: invalidateMock },
        list: { invalidate: invalidateMock },
      },
    }),
    notification: {
      list: {
        useQuery: () => ({
          data: [],
          isLoading: false,
        }),
      },
      unreadCount: {
        useQuery: () => ({ data: 0 }),
      },
      markRead: { useMutation: () => ({ mutate: vi.fn() }) },
      markAllRead: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    group: {
      listPendingInvitations: {
        useQuery: () => ({
          data: [
            {
              id: 1,
              groupId: 42,
              groupName: "Trip Fund",
              inviterName: "Huzzi",
              token: "tok123",
            },
          ],
        }),
      },
      acceptInvitation: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      declineInvitation: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

describe("Notifications", () => {
  it("renders pending invitations section", () => {
    render(
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>,
    );

    expect(screen.getByText("Pending invitations")).toBeInTheDocument();
    expect(screen.getByText("Trip Fund")).toBeInTheDocument();
    expect(screen.getByText("Invited by Huzzi")).toBeInTheDocument();
  });
});
