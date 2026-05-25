import React, { useEffect, useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Key, 
  Plus, 
  Copy, 
  Check, 
  Trash2, 
  Edit2, 
  Shield, 
  Loader2, 
  X, 
  Coins, 
  Info,
  AlertTriangle 
} from 'lucide-react';

export interface TeamMemberDto {
  userId: string;
  username: string;
  email: string;
  role: string;
  allocatedQuota: number;
  usedTokens: number;
  joinedAt: string;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export const Teams: React.FC = () => {
  const [members, setMembers] = useState<TeamMemberDto[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyDto[]>([]);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);
  const [loadingKeys, setLoadingKeys] = useState<boolean>(true);
  
  // Add Member State
  const [memberEmail, setMemberEmail] = useState<string>('');
  const [addingMember, setAddingMember] = useState<boolean>(false);
  
  // Quota Modifier Modal State
  const [selectedMember, setSelectedMember] = useState<TeamMemberDto | null>(null);
  const [newQuotaLimit, setNewQuotaLimit] = useState<number>(100_000);
  const [updatingQuota, setUpdatingQuota] = useState<boolean>(false);
  
  // API Key Generator State
  const [keyName, setKeyName] = useState<string>('');
  const [generatingKey, setGeneratingKey] = useState<boolean>(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  
  // Messages / Error Telemetry
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const response = await fetch('/api/teams/info');
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      } else {
        const err = await response.json();
        setErrorMessage(err.message || 'Failed to fetch team members info');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Network connection lost while fetching team members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchApiKeys = async () => {
    setLoadingKeys(true);
    try {
      const response = await fetch('/api/users/api-keys');
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      } else {
        const err = await response.json();
        setErrorMessage(err.message || 'Failed to fetch API keys');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Network connection lost while fetching API keys');
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchApiKeys();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmail.trim()) return;
    setAddingMember(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/teams/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail.trim() }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMessage(`Successfully added ${memberEmail} to team.`);
        setMemberEmail('');
        fetchMembers();
      } else {
        setErrorMessage(data.message || 'Failed to add member to team');
      }
    } catch (err) {
      setErrorMessage('Error communicating with NestJS backend');
    } finally {
      setAddingMember(false);
    }
  };

  const handleOpenQuotaModal = (member: TeamMemberDto) => {
    setSelectedMember(member);
    setNewQuotaLimit(member.allocatedQuota);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleUpdateQuota = async () => {
    if (!selectedMember) return;
    setUpdatingQuota(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/teams/quota', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.userId,
          tokensLimit: Number(newQuotaLimit),
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMessage(`Successfully updated daily token quota for ${selectedMember.username}.`);
        setSelectedMember(null);
        fetchMembers();
      } else {
        setErrorMessage(data.message || 'Failed to update member daily quota');
      }
    } catch (err) {
      setErrorMessage('Error communicating with backend to adjust quota');
    } finally {
      setUpdatingQuota(false);
    }
  };

  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    setGeneratingKey(true);
    setNewRawKey(null);
    setCopiedKey(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/users/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName.trim() }),
      });
      const data = await response.json();
      if (response.ok) {
        setNewRawKey(data.rawKey);
        setKeyName('');
        fetchApiKeys();
      } else {
        setErrorMessage(data.message || 'Failed to generate named API Key');
      }
    } catch (err) {
      setErrorMessage('Error generating member-specific credentials');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Applications using it will immediately lose access.')) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/users/api-key/${keyId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMessage('API key has been permanently revoked.');
        fetchApiKeys();
      } else {
        setErrorMessage(data.message || 'Failed to revoke API key');
      }
    } catch (err) {
      setErrorMessage('Error communicating with API key service');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="flex flex-col gap-8 w-full animate-fadeIn font-sans pb-16">
      
      {/* Premium Gradient Top Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
          Workspace & Member Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage team multi-tenancy access limits, allocate sub-quota budgets, and provision cryptographically secure API credentials.
        </p>
      </div>

      {/* Alert Notifications */}
      {errorMessage && (
        <div className="w-full bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-mono p-4 rounded-xl shadow-md flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-550 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="w-full bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-mono p-4 rounded-xl shadow-md flex items-center gap-3">
          <Check className="w-4 h-4 text-emerald-550 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 2-Column Responsive Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Members Table (Spans 2 columns) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="w-full bg-white dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xl p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" />
                  <span>Team Members & Consumption Telemetry</span>
                </h3>
                <p className="text-xs text-slate-450 dark:text-slate-400 mt-1">
                  Active sub-quota buckets debited atomically against Team Master Wallet.
                </p>
              </div>

              {/* Quick Add Member Trigger */}
              <form onSubmit={handleAddMember} className="flex gap-2 w-full sm:w-auto">
                <input
                  type="email"
                  placeholder="Invite user by email..."
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-48"
                  required
                />
                <button
                  type="submit"
                  disabled={addingMember}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-md shadow-indigo-650/10"
                >
                  {addingMember ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                  <span>Invite</span>
                </button>
              </form>
            </div>

            {loadingMembers ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <span className="text-xs text-slate-500 font-mono">Syncing team workspaces...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 font-mono">
                      <th className="pb-3 px-2">Member</th>
                      <th className="pb-3 px-2">Workspace Role</th>
                      <th className="pb-3 px-2">Quota Limits</th>
                      <th className="pb-3 px-2 text-right">Adjust Quota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const percentage = Math.min(Math.round((m.usedTokens / m.allocatedQuota) * 100), 100);
                      const isOwner = m.role === 'Owner';
                      
                      // Semantic progress color
                      let barColor = 'bg-emerald-555';
                      if (percentage > 90) barColor = 'bg-rose-555';
                      else if (percentage > 70) barColor = 'bg-amber-555';

                      return (
                        <tr key={m.userId} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                          
                          {/* User Metadata */}
                          <td className="py-4 px-2">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                                {m.username}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                {m.email}
                              </span>
                            </div>
                          </td>

                          {/* Role Badge */}
                          <td className="py-4 px-2">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isOwner 
                                ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}>
                              {isOwner ? <Shield size={10} /> : null}
                              <span>{m.role}</span>
                            </span>
                          </td>

                          {/* Active Quota Telemetry (Progress Bar) */}
                          <td className="py-4 px-2 min-w-[160px] sm:min-w-[200px]">
                            <div className="flex flex-col gap-1 w-full max-w-[240px]">
                              <div className="flex items-center justify-between text-[11px] font-mono">
                                <span className="text-slate-800 dark:text-slate-300 font-semibold">
                                  {m.usedTokens.toLocaleString()}
                                </span>
                                <span className="text-slate-400">
                                  / {isOwner ? 'Master Wallet' : m.allocatedQuota.toLocaleString()}
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-200/40 dark:border-slate-800/60 shadow-inner">
                                <div 
                                  className={`h-full ${barColor} transition-all duration-500`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-slate-400 font-semibold self-end">
                                {percentage}% Consumed
                              </span>
                            </div>
                          </td>

                          {/* Edit Action Button */}
                          <td className="py-4 px-2 text-right">
                            {!isOwner ? (
                              <button
                                onClick={() => handleOpenQuotaModal(m)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-indigo-500 transition-colors cursor-pointer"
                                title="Adjust Token Budget"
                              >
                                <Edit2 size={13} />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono italic pr-2">
                                Shared Core
                              </span>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Key generator & credentials panel (Spans 1 column) */}
        <div className="flex flex-col gap-8">
          
          {/* Key Generator Card */}
          <div className="w-full bg-white dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xl p-8 flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-500" />
                <span>Private API Keys</span>
              </h3>
              <p className="text-xs text-slate-450 dark:text-slate-400 mt-1">
                Provision member keys mapping requests straight to token boundaries.
              </p>
            </div>

            {/* Quick Generate Widget */}
            <form onSubmit={handleGenerateApiKey} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                  Key Identifier Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. dev-cluster-completions"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={generatingKey}
                className="w-full px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 disabled:bg-slate-400 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-md"
              >
                {generatingKey ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                <span>Generate API Key</span>
              </button>
            </form>

            {/* One-time Show Key Display */}
            {newRawKey && (
              <div className="w-full bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/30 rounded-xl p-4 flex flex-col gap-3.5 animate-fadeIn">
                <div className="flex items-center gap-2 text-indigo-650 dark:text-indigo-400">
                  <Info size={14} className="flex-shrink-0" />
                  <span className="text-[10px] font-bold font-sans uppercase tracking-wide">
                    Copy Private Key (Shown Once)
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-950 rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-900/50 font-mono text-[11px] text-slate-900 dark:text-white shadow-inner justify-between select-all">
                  <span className="truncate pr-2">{newRawKey}</span>
                  <button
                    onClick={() => copyToClipboard(newRawKey)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-900 rounded text-slate-500 hover:text-indigo-500 cursor-pointer"
                  >
                    {copiedKey ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Make sure to save this secret token key. You will not be able to retrieve or view it again.
                </p>
              </div>
            )}

            {/* Active API Keys List */}
            <div className="flex flex-col gap-3 mt-4">
              <label className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                Active Client Keys
              </label>

              {loadingKeys ? (
                <div className="py-6 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  No active keys.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {apiKeys.map((key) => (
                    <div 
                      key={key.id} 
                      className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-900 rounded-xl hover:border-slate-350 dark:hover:border-slate-800 transition-all shadow-sm"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                          {key.name}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          Issued {new Date(key.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRevokeApiKey(key.id)}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-555 rounded-lg transition-colors cursor-pointer"
                        title="Revoke and Delete Key"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Quick Guide Card */}
          <div className="w-full bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col gap-4">
            <h4 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-indigo-500" />
              <span>Gateway Key Usage</span>
            </h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Provisioned keys allow clients to query CostOps completions bypassing standard web login. Authenticate your terminal scripts using the header:
            </p>
            <div className="bg-slate-950 dark:bg-black p-3.5 rounded-xl border border-slate-900 font-mono text-[10px] text-emerald-400 shadow-inner select-all overflow-x-auto whitespace-pre leading-relaxed">
{`curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer <your_costops_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Ping"}]
  }'`}
            </div>
          </div>

        </div>

      </div>

      {/* Quota Modifier Modal (Sleek Blur Overlay) */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-2xl shadow-2xl p-8 flex flex-col gap-6 animate-scaleIn">
            
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-indigo-500" />
                <span>Adjust Token Allocation</span>
              </h3>
              <button 
                onClick={() => setSelectedMember(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-4 font-sans text-xs">
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Editing: {selectedMember.username}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                  ID: {selectedMember.userId}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                  Daily Sub-Quota Budget (Tokens)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={newQuotaLimit}
                  onChange={(e) => setNewQuotaLimit(Number(e.target.value))}
                  className="px-3 py-2 text-xs rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <p className="text-[10px] text-slate-450 dark:text-slate-500 leading-normal">
                Sub-quotas allocate boundaries within the master wallet. Hitting 100% of this quota blocks requests with a 403 error, even if the team master wallet has remaining budget.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                onClick={() => setSelectedMember(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateQuota}
                disabled={updatingQuota}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-650 hover:bg-indigo-700 disabled:bg-slate-400 rounded-xl cursor-pointer shadow-md shadow-indigo-650/15 flex items-center gap-1.5 transition-all"
              >
                {updatingQuota ? <Loader2 size={13} className="animate-spin" /> : null}
                <span>Save Allocations</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Teams;
