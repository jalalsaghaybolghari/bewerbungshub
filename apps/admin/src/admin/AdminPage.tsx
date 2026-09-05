import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui';
import { TrashIcon } from '../components/icons';
import {
  useAdminSettings,
  useAdminStats,
  useAdminUsers,
  useApproveAdminUser,
  useDeleteAdminUser,
  useSetAdminUserLocked,
  useUpdateAdminSettings,
} from './api';

const PAGE_SIZE = 20;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="text-xs text-slate">{label}</div>
    </Card>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: users, isLoading: usersLoading } = useAdminUsers({ page, pageSize: PAGE_SIZE });
  const { data: settings } = useAdminSettings();
  const deleteMutation = useDeleteAdminUser();
  const approveMutation = useApproveAdminUser();
  const lockMutation = useSetAdminUserLocked();
  const updateSettingsMutation = useUpdateAdminSettings();

  function handleDelete(id: string, email: string) {
    if (
      !confirm(
        `Permanently delete ${email} and all their applications, CVs, interviews, and follow-ups? This cannot be undone.`,
      )
    )
      return;
    deleteMutation.mutate(id);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Admin</h1>

      {statsLoading ? (
        <p className="text-slate">Loading…</p>
      ) : stats ? (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total users" value={stats.totalUsers} />
          <StatCard label="Verified users" value={stats.verifiedUsers} />
          <StatCard label="Admins" value={stats.adminUsers} />
          <StatCard label="Total applications" value={stats.totalApplications} />
          <StatCard label="Total CVs" value={stats.totalCvs} />
          <StatCard label="New signups (7d)" value={stats.newUsersLast7Days} />
        </div>
      ) : null}

      {settings && (
        <Card className="mb-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={settings.autoApproveRegistrations}
              disabled={updateSettingsMutation.isPending}
              onChange={(e) =>
                updateSettingsMutation.mutate({ autoApproveRegistrations: e.target.checked })
              }
            />
            Auto-approve new registrations
          </label>
          <p className="mt-1 text-xs text-slate">
            When off, new sign-ups sit pending until approved below — no verification code is
            sent until then.
          </p>
        </Card>
      )}

      <Card className="p-0">
        <h2 className="border-b border-slate/15 p-4 font-semibold text-ink">Users</h2>

        {usersLoading && <p className="p-4 text-slate">Loading…</p>}

        {users && users.items.length === 0 && <p className="p-4 text-slate">No users yet.</p>}

        {users && users.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate/15 bg-slate/5 text-left text-xs uppercase tracking-wide text-slate">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Verified</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">API Key</th>
                  <th className="px-4 py-3">Approval</th>
                  <th className="px-4 py-3">Locked</th>
                  <th className="px-4 py-3">Applications</th>
                  <th className="px-4 py-3">CVs</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.items.map((u) => (
                  <tr key={u.id} className="border-b border-slate/10 last:border-0">
                    <td className="px-4 py-3 text-ink">{u.email}</td>
                    <td className="px-4 py-3 text-slate">{u.displayName}</td>
                    <td className="px-4 py-3">{u.emailVerified ? '✓' : '—'}</td>
                    <td className="px-4 py-3">{u.isAdmin ? '✓' : '—'}</td>
                    <td className="px-4 py-3">{u.hasApiKey ? '✓' : '—'}</td>
                    <td className="px-4 py-3">
                      {u.approvalStatus === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-slate">Pending</span>
                          <button
                            type="button"
                            onClick={() => approveMutation.mutate(u.id)}
                            disabled={approveMutation.isPending}
                            className="rounded-lg border border-slate/30 px-2 py-1 text-xs font-semibold text-ink hover:bg-slate/5 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate">Approved</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() =>
                            lockMutation.mutate({ id: u.id, locked: !u.isLocked })
                          }
                          disabled={lockMutation.isPending}
                          className="rounded-lg border border-slate/30 px-2 py-1 text-xs font-semibold text-ink hover:bg-slate/5 disabled:opacity-50"
                        >
                          {u.isLocked ? 'Unlock' : 'Lock'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate">{u.applicationCount}</td>
                    <td className="px-4 py-3 text-slate">{u.cvCount}</td>
                    <td className="px-4 py-3 text-slate">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {u.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => handleDelete(u.id, u.email)}
                          disabled={deleteMutation.isPending}
                          aria-label="Delete"
                          className="text-slate hover:text-danger disabled:opacity-50"
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {users && users.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate/15 p-4 text-sm text-slate">
            <span>
              {users.total} total · page {users.page}
            </span>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-slate/30 px-3 py-1.5 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </button>
              <button
                className="rounded-lg border border-slate/30 px-3 py-1.5 disabled:opacity-50"
                disabled={page * PAGE_SIZE >= users.total}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
