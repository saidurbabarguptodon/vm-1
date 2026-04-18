import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Server, Users, Activity, Terminal, Trash2, LayoutDashboard, UserCircle, Settings, Shield, Clock, Globe, Menu, X, Cpu, MemoryStick, Wifi, RefreshCw, Heart, Drumstick, MapPin, ChevronLeft, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

interface BotInfo {
  username: string;
  status: "connecting" | "online" | "disconnected" | "error";
  logs: string[];
  ping?: number;
  health?: number;
  food?: number;
  position?: { x: number, y: number, z: number };
  uptime?: number;
  host?: string;
  port?: number;
  version?: string;
  autoJoin?: boolean;
  autoJoinInterval?: number;
  autoStart?: boolean;
}

export default function App() {
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('Bot');
  const [count, setCount] = useState('10');
  const [version, setVersion] = useState('');
  const [autoJoin, setAutoJoin] = useState(false);
  const [autoJoinInterval, setAutoJoinInterval] = useState('5');
  const [autoStart, setAutoStart] = useState(false);
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [selectedBotUsername, setSelectedBotUsername] = useState<string | null>(null);
  const [editingBot, setEditingBot] = useState<BotInfo | null>(null);
  const [editForm, setEditForm] = useState({ newUsername: '', address: '', version: '', autoJoin: false, autoJoinInterval: '5', autoStart: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [systemStats, setSystemStats] = useState({ memory: 0, uptime: 0, cpu: 0, totalMem: 0, freeMem: 0 });
  const [webPing, setWebPing] = useState(0);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'manager'>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [bots, selectedBotUsername]);

  // Poll for bot status
  useEffect(() => {
    const fetchStatus = async () => {
      const startTime = Date.now();
      try {
        const res = await fetch('/api/bots/status');
        if (res.ok) {
          const data = await res.json();
          setBots(data.bots);
          if (data.system) {
            setSystemStats(data.system);
          }
          setWebPing(Date.now() - startTime);
        }
      } catch (err) {
        console.error("Failed to fetch bot status");
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      setError('Server Address is required');
      return;
    }
    if (!username) {
      setError('Username is required');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/bots/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, username, count, version: version || undefined, autoJoin, autoJoinInterval, autoStart }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start bots');
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStopAll = async () => {
    try {
      await fetch('/api/bots/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    } catch (err) {
      console.error("Failed to stop bots");
    }
  };

  const handleStopBot = async (username: string) => {
    try {
      await fetch('/api/bots/stop', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ username }) 
      });
    } catch (err) {
      console.error("Failed to stop bot");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBot) return;
    try {
      const res = await fetch('/api/bots/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: editingBot.username, 
          newUsername: editForm.newUsername,
          address: editForm.address, 
          version: editForm.version || undefined, 
          autoJoin: editForm.autoJoin, 
          autoJoinInterval: editForm.autoJoinInterval,
          autoStart: editForm.autoStart
        }),
      });
      const data = await res.json();
      if (data.success && data.newUsername && selectedBotUsername === editingBot.username) {
        setSelectedBotUsername(data.newUsername);
      }
      setEditingBot(null);
    } catch (err) {
      console.error("Failed to edit bot:", err);
    }
  };

  const handleBotAction = async (botUsername: string, action: 'start' | 'stop' | 'restart' | 'terminate') => {
    try {
      await fetch('/api/bots/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: botUsername, action }),
      });
    } catch (err) {
      console.error(`Failed to ${action} bot:`, err);
    }
  };

  const handleBotMove = async (botUsername: string, control: string, state: boolean) => {
    try {
      await fetch('/api/bots/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: botUsername, control, state }),
      });
    } catch (err) {
      console.error(`Failed to move bot:`, err);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !selectedBotUsername) return;
    
    const msg = chatMessage;
    setChatMessage('');
    
    try {
      await fetch('/api/bots/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedBotUsername, message: msg }),
      });
    } catch (err) {
      console.error("Failed to send chat:", err);
    }
  };

  const formatUptime = (seconds: number) => {
    if (!seconds) return '0s';
    const s = Math.floor(seconds);
    if (s < 60) return `${s}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-[#2ecc71]';
      case 'connecting': return 'text-[#f1c40f]';
      case 'error': return 'text-[#ff4d4d]';
      default: return 'text-[#8b949e]';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'online': return 'bg-[#2ecc71] shadow-[0_0_8px_#2ecc71]';
      case 'connecting': return 'bg-[#f1c40f]';
      case 'error': return 'bg-[#ff4d4d]';
      default: return 'bg-[#8b949e]';
    }
  };

  const onlineCount = bots.filter(b => b.status === 'online').length;
  const onlineBotsWithPing = bots.filter(b => b.status === 'online' && b.ping !== undefined && b.ping > 0);
  const avgPing = onlineBotsWithPing.length > 0 
    ? Math.round(onlineBotsWithPing.reduce((acc, b) => acc + (b.ping || 0), 0) / onlineBotsWithPing.length) 
    : 0;

  const formatSystemUptime = (seconds: number) => {
    if (!seconds) return '0s';
    const s = Math.floor(seconds);
    if (s < 60) return `${s}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const selectedBot = bots.find(b => b.username === selectedBotUsername);

  if (selectedBot) {
    return (
      <div className="min-h-screen w-full bg-[#0b0e14] text-[#e6edf3] font-sans overflow-hidden flex flex-col">
        {/* Header */}
        <header className="bg-[#161b22] border-b border-[#30363d] px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedBotUsername(null)} 
              className="p-2 bg-[#0b0e14] border border-[#30363d] rounded-md hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <img 
                src={`https://mc-heads.net/avatar/${selectedBot.username}/100`} 
                alt={selectedBot.username}
                className="w-8 h-8 rounded bg-[#0b0e14] pixelated"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/Steve/100';
                }}
              />
              <h1 className="text-xl font-bold text-white tracking-tight">{selectedBot.username}</h1>
              <div className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase border ${getStatusColor(selectedBot.status).replace('text-', 'border-').replace('text-', 'text-')} bg-opacity-10`}>
                {selectedBot.status}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
            
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col items-center justify-center gap-2">
                <Clock className="w-5 h-5 text-[#3498db]" />
                <span className="text-[12px] text-[#8b949e] uppercase font-bold tracking-wider">Uptime</span>
                <span className="text-lg font-semibold text-white">{formatUptime(selectedBot.uptime || 0)}</span>
              </div>
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col items-center justify-center gap-2">
                <Wifi className="w-5 h-5 text-[#2ecc71]" />
                <span className="text-[12px] text-[#8b949e] uppercase font-bold tracking-wider">Ping</span>
                <span className="text-lg font-semibold text-white">{selectedBot.ping || 0} ms</span>
              </div>
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col items-center justify-center gap-2">
                <Heart className="w-5 h-5 text-[#e74c3c]" />
                <span className="text-[12px] text-[#8b949e] uppercase font-bold tracking-wider">Health</span>
                <span className="text-lg font-semibold text-white">{Math.round(selectedBot.health || 0)} / 20</span>
              </div>
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col items-center justify-center gap-2">
                <Drumstick className="w-5 h-5 text-[#f39c12]" />
                <span className="text-[12px] text-[#8b949e] uppercase font-bold tracking-wider">Hunger</span>
                <span className="text-lg font-semibold text-white">{Math.round(selectedBot.food || 0)} / 20</span>
              </div>
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col items-center justify-center gap-2">
                <Shield className="w-5 h-5 text-[#9b59b6]" />
                <span className="text-[12px] text-[#8b949e] uppercase font-bold tracking-wider">Armour</span>
                <span className="text-lg font-semibold text-white">Active</span>
              </div>
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col items-center justify-center gap-2">
                <MapPin className="w-5 h-5 text-[#1abc9c]" />
                <span className="text-[12px] text-[#8b949e] uppercase font-bold tracking-wider">Coordinates</span>
                <span className="text-sm font-semibold text-white text-center">
                  {selectedBot.position ? `${selectedBot.position.x.toFixed(1)}, ${selectedBot.position.y.toFixed(1)}, ${selectedBot.position.z.toFixed(1)}` : 'Unknown'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Controls Card */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#3498db]" />
                    Bot Controls
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleBotAction(selectedBot.username, 'start')}
                    className="px-4 py-2 bg-[#2ecc71]/10 text-[#2ecc71] hover:bg-[#2ecc71]/20 rounded-md transition-colors flex items-center gap-2 text-sm font-semibold"
                  >
                    <Play className="w-4 h-4" />
                    Start
                  </button>
                  <button 
                    onClick={() => handleBotAction(selectedBot.username, 'stop')}
                    className="px-4 py-2 bg-[#f1c40f]/10 text-[#f1c40f] hover:bg-[#f1c40f]/20 rounded-md transition-colors flex items-center gap-2 text-sm font-semibold"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </button>
                  <button 
                    onClick={() => handleBotAction(selectedBot.username, 'restart')}
                    className="px-4 py-2 bg-[#3498db]/10 text-[#3498db] hover:bg-[#3498db]/20 rounded-md transition-colors flex items-center gap-2 text-sm font-semibold"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Restart
                  </button>
                  <div className="w-px h-6 bg-[#30363d] mx-1"></div>
                  <button 
                    onClick={() => { handleBotAction(selectedBot.username, 'terminate'); setSelectedBotUsername(null); }} 
                    className="px-4 py-2 bg-[#ff4d4d]/10 text-[#ff4d4d] hover:bg-[#ff4d4d]/20 rounded-md transition-colors flex items-center gap-2 text-sm font-semibold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Terminate
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* World View Radar */}
                <div className="lg:col-span-1 bg-[#161b22] border border-[#30363d] rounded-xl p-6 flex flex-col min-h-[400px]">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                    <Globe className="w-5 h-5 text-[#1abc9c]" />
                    World View (Radar)
                  </h2>
                  <div className="flex-1 bg-[#0b0e14] border border-[#30363d] rounded-lg relative overflow-hidden flex items-center justify-center">
                    {/* Radar Grid */}
                    <div className="absolute inset-0 opacity-20" style={{
                      backgroundImage: 'linear-gradient(#30363d 1px, transparent 1px), linear-gradient(90deg, #30363d 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: 'center center'
                    }}></div>
                    
                    {/* Center Crosshair */}
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-[#1abc9c]/30"></div>
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#1abc9c]/30"></div>
                    
                    {/* Radar Circle */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full border border-[#1abc9c]/20"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] rounded-full border border-[#1abc9c]/10"></div>

                    {/* Entities */}
                    {selectedBot.status === 'online' ? (
                      <>
                        {/* The Bot */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-[#3498db] rounded-full shadow-[0_0_10px_#3498db] z-10"></div>
                        
                        {/* Nearby Entities */}
                        {(selectedBot as any).nearbyEntities?.map((entity: any) => {
                          // Map -32..32 to 0..100%
                          const left = 50 + (entity.x / 32) * 50;
                          const top = 50 + (entity.z / 32) * 50;
                          
                          // Clamp to visible area
                          if (left < 0 || left > 100 || top < 0 || top > 100) return null;
                          
                          let color = '#8b949e'; // Default gray
                          if (entity.type === 'player') color = '#e74c3c'; // Red for players
                          else if (entity.type === 'mob') color = '#f39c12'; // Orange for mobs
                          else if (entity.type === 'object') color = '#2ecc71'; // Green for items/objects
                          
                          return (
                            <div 
                              key={entity.id}
                              className="absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                              style={{ left: `${left}%`, top: `${top}%`, backgroundColor: color, boxShadow: `0 0 5px ${color}` }}
                            >
                              <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[#010409] border border-[#30363d] rounded text-[10px] text-white whitespace-nowrap z-20">
                                {entity.name} ({entity.type})
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <span className="text-[#8b949e] z-10">Bot offline</span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-[#8b949e] justify-center">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#3498db]"></div> You</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#e74c3c]"></div> Players</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#f39c12]"></div> Mobs</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#2ecc71]"></div> Objects</div>
                  </div>
                </div>

                {/* Terminal */}
                <div className="lg:col-span-2 bg-[#161b22] border border-[#30363d] rounded-xl p-6 flex flex-col min-h-[400px] h-[600px]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <Terminal className="w-5 h-5 text-[#3498db]" />
                  Bot Terminal
                </h2>
                <div ref={terminalContainerRef} className="flex-1 bg-[#0b0e14] border border-[#30363d] rounded-t-lg p-4 font-mono text-[13px] overflow-y-auto custom-scrollbar">
                  {selectedBot.logs.length === 0 ? (
                    <span className="text-[#8b949e]">Waiting for logs...</span>
                  ) : (
                    selectedBot.logs.map((log, i) => (
                      <div key={i} className="mb-1 text-[#e6edf3] break-words">
                        {log}
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleSendChat} className="flex border border-t-0 border-[#30363d] rounded-b-lg overflow-hidden">
                  <input 
                    type="text" 
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Type a message or command (e.g. /help)..."
                    className="flex-1 bg-[#0d1117] px-4 py-3 text-sm text-white focus:outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={!chatMessage.trim() || selectedBot.status !== 'online'}
                    className="bg-[#3498db] hover:bg-[#2980b9] text-white px-6 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </form>
              </div>
            </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#0b0e14] text-[#e6edf3] font-sans overflow-hidden selection:bg-[#3498db]/30">
      
      {/* Header */}
      <header className="bg-[#010409] border-b border-[#30363d] px-6 py-4 flex items-center justify-between z-50 flex-shrink-0 relative">
        <div className="flex items-center gap-4">
          <div className="text-xl font-extrabold bg-gradient-to-br from-[#2ecc71] to-[#3498db] bg-clip-text text-transparent tracking-tight flex items-center gap-2">
            <Server className="w-6 h-6 text-[#2ecc71]" />
            MINEBOT NEXUS
          </div>
        </div>
        
        <nav className="hidden md:flex items-center gap-2">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'overview' ? 'bg-[#3498db]/10 text-[#3498db]' : 'text-[#8b949e] hover:bg-white/5 hover:text-white'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('manager')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'manager' ? 'bg-[#3498db]/10 text-[#3498db]' : 'text-[#8b949e] hover:bg-white/5 hover:text-white'}`}
          >
            <Terminal className="w-4 h-4" />
            Bot Manager
          </button>
        </nav>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-[#161b22] border border-[#30363d]">
            <UserCircle className="w-5 h-5 text-[#8b949e]" />
          </div>
          <button 
            className="md:hidden text-[#8b949e] hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] flex">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          ></div>
          <div className="relative w-64 max-w-sm bg-[#010409] border-r border-[#30363d] h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-[#2ecc71]" />
                Menu
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-[#8b949e] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button 
                onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
                className={`px-4 py-3 rounded-md text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'overview' ? 'bg-[#3498db]/10 text-[#3498db]' : 'text-[#8b949e] hover:bg-white/5 hover:text-white'}`}
              >
                <LayoutDashboard className="w-5 h-5" />
                Overview
              </button>
              <button 
                onClick={() => { setActiveTab('manager'); setMobileMenuOpen(false); }}
                className={`px-4 py-3 rounded-md text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'manager' ? 'bg-[#3498db]/10 text-[#3498db]' : 'text-[#8b949e] hover:bg-white/5 hover:text-white'}`}
              >
                <Terminal className="w-5 h-5" />
                Bot Manager
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              
              {/* System Overview */}
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#3498db]" />
                  System Overview
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                    <div className="text-[12px] text-[#8b949e] uppercase tracking-[1px] mb-2 font-semibold flex items-center gap-2">
                      <MemoryStick className="w-4 h-4" /> Memory Usage
                    </div>
                    <div className="text-2xl font-bold text-[#3498db]">{(systemStats.memory / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                  <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                    <div className="text-[12px] text-[#8b949e] uppercase tracking-[1px] mb-2 font-semibold flex items-center gap-2">
                      <Cpu className="w-4 h-4" /> CPU Usage
                    </div>
                    <div className="text-2xl font-bold text-[#e74c3c]">{systemStats.cpu.toFixed(2)}</div>
                  </div>
                  <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                    <div className="text-[12px] text-[#8b949e] uppercase tracking-[1px] mb-2 font-semibold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#f1c40f]" /> Uptime
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{formatUptime(systemStats.uptime)}</div>
                  </div>
                  <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                    <div className="text-[12px] text-[#8b949e] uppercase tracking-[1px] mb-2 font-semibold flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-[#2ecc71]" /> Web Ping
                    </div>
                    <div className="text-2xl font-bold text-white">{webPing}ms</div>
                  </div>
                </div>
              </div>

              {/* Bots Overview */}
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#2ecc71]" />
                  Bots Overview
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                    <div className="text-[12px] text-[#8b949e] uppercase tracking-[1px] mb-2 font-semibold flex items-center gap-2">
                      <Terminal className="w-4 h-4" /> Total Bots
                    </div>
                    <div className="text-3xl font-bold text-white">{bots.length}</div>
                  </div>
                  <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                    <div className="text-[12px] text-[#8b949e] uppercase tracking-[1px] mb-2 font-semibold flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#2ecc71]" /> Online Bots
                    </div>
                    <div className="text-3xl font-bold text-[#2ecc71]">{onlineCount}</div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'manager' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <header className="flex justify-between items-center mb-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Bot Manager</h1>
              </header>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Control Panel */}
                <div className="xl:col-span-1 space-y-6">
                  <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.2)] flex flex-col gap-5">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2 border-b border-[#30363d] pb-4">
                      <Shield className="w-5 h-5 text-[#2ecc71]" />
                      Deployment Config
                    </h2>
                    <form onSubmit={handleStart} className="flex flex-col gap-4">
                      <div>
                        <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Server Address</label>
                        <input 
                          type="text" 
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="mc.play.fun or 0.0.0.0:25565" 
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors placeholder:text-[#8b949e]/50"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Username</label>
                          <input 
                            type="text" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="BotName" 
                            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors placeholder:text-[#8b949e]/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Version</label>
                          <input 
                            type="text" 
                            value={version}
                            onChange={(e) => setVersion(e.target.value)}
                            placeholder="Auto" 
                            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors placeholder:text-[#8b949e]/50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Bot Count</label>
                        <input 
                          type="number" 
                          min="1"
                          max="20"
                          value={count}
                          onChange={(e) => setCount(e.target.value)}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors"
                        />
                      </div>

                      <div className="flex items-center justify-between bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5">
                        <label className="text-[13px] text-[#8b949e] font-medium cursor-pointer flex-1" htmlFor="autoJoinToggle">
                          Auto Join (Reconnect on kick/error)
                        </label>
                        <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                          <input 
                            type="checkbox" 
                            name="toggle" 
                            id="autoJoinToggle" 
                            checked={autoJoin}
                            onChange={(e) => setAutoJoin(e.target.checked)}
                            className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 border-[#30363d] appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-5 checked:border-[#2ecc71]"
                          />
                          <label htmlFor="autoJoinToggle" className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${autoJoin ? 'bg-[#2ecc71]' : 'bg-[#30363d]'}`}></label>
                        </div>
                      </div>

                      {autoJoin && (
                        <div className="animate-in slide-in-from-top-2 duration-200">
                          <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Auto Join Interval (sec)</label>
                          <input 
                            type="number" 
                            min="1"
                            value={autoJoinInterval}
                            onChange={(e) => setAutoJoinInterval(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5">
                        <label className="text-[13px] text-[#8b949e] font-medium cursor-pointer flex-1" htmlFor="autoStartToggle">
                          Auto Start (On Server Boot)
                        </label>
                        <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                          <input 
                            type="checkbox" 
                            name="autoStartToggle" 
                            id="autoStartToggle" 
                            checked={autoStart}
                            onChange={(e) => setAutoStart(e.target.checked)}
                            className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 border-[#30363d] appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-5 checked:border-[#3498db]"
                          />
                          <label htmlFor="autoStartToggle" className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${autoStart ? 'bg-[#3498db]' : 'bg-[#30363d]'}`}></label>
                        </div>
                      </div>

                      {error && (
                        <div className="p-3 bg-[#ff4d4d]/10 border border-[#ff4d4d]/20 rounded-md text-[#ff4d4d] text-sm">
                          {error}
                        </div>
                      )}

                      <div className="pt-2 flex flex-col gap-3">
                        <button 
                          type="submit"
                          disabled={loading}
                          className="w-full bg-[#2ecc71] hover:bg-[#27ae60] text-black font-semibold py-2.5 px-4 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase"
                        >
                          <Play className="w-4 h-4" />
                          {loading ? 'DEPLOYING...' : `Deploy ${username}`}
                        </button>
                        <button 
                          type="button"
                          onClick={handleStopAll}
                          className="w-full bg-transparent border border-[#ff4d4d]/50 hover:bg-[#ff4d4d]/10 text-[#ff4d4d] font-semibold py-2.5 px-4 rounded-md transition-colors text-sm flex items-center justify-center gap-2"
                        >
                          <Square className="w-4 h-4" />
                          TERMINATE ALL
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Bots List */}
                <div className="xl:col-span-2 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Activity className="w-5 h-5 text-[#3498db]" />
                      Bots List ({bots.length})
                    </h2>
                  </div>

                  {bots.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#8b949e] border border-dashed border-[#30363d] rounded-xl bg-[#161b22]/50">
                      <Terminal className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm">No bots are currently deployed.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar pr-2 max-h-[600px]">
                      {bots.map((bot) => (
                        <div 
                          key={bot.username} 
                          onClick={() => setSelectedBotUsername(bot.username)}
                          className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.2)] cursor-pointer hover:border-[#3498db]/50 transition-all hover:shadow-[0_4px_16px_rgba(52,152,219,0.15)] group"
                        >
                          <div className="flex items-center gap-4">
                            <img 
                              src={`https://mc-heads.net/avatar/${bot.username}/100`} 
                              alt={bot.username}
                              className="w-12 h-12 rounded bg-[#0b0e14] pixelated"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/Steve/100';
                              }}
                            />
                            <div>
                              <h3 className="font-semibold text-white text-[15px] truncate max-w-[120px] group-hover:text-[#3498db] transition-colors">{bot.username}</h3>
                              <div className="flex flex-col gap-1 mt-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDot(bot.status)}`}></span>
                                  <span className={`text-[12px] capitalize ${getStatusColor(bot.status)}`}>
                                    {bot.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-[#8b949e]">
                                  <span className="flex items-center gap-1"><Wifi className="w-3 h-3"/> {bot.ping || 0}ms</span>
                                  <span className="flex items-center gap-1 truncate max-w-[90px]"><Server className="w-3 h-3"/> {bot.host || 'Unknown'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={() => handleBotAction(bot.username, 'start')}
                              className="p-2 bg-[#2ecc71]/10 text-[#2ecc71] hover:bg-[#2ecc71]/20 rounded-md transition-colors"
                              title="Start Bot"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleBotAction(bot.username, 'stop')}
                              className="p-2 bg-[#f1c40f]/10 text-[#f1c40f] hover:bg-[#f1c40f]/20 rounded-md transition-colors"
                              title="Stop Bot"
                            >
                              <Square className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleBotAction(bot.username, 'restart')}
                              className="p-2 bg-[#3498db]/10 text-[#3498db] hover:bg-[#3498db]/20 rounded-md transition-colors"
                              title="Restart Bot"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Edit Modal */}
      {editingBot && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingBot(null)}></div>
          <div className="relative bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#3498db]" />
                Edit {editingBot.username}
              </h2>
              <button onClick={() => setEditingBot(null)} className="text-[#8b949e] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Username</label>
                <input 
                  type="text" 
                  value={editForm.newUsername}
                  onChange={(e) => setEditForm({...editForm, newUsername: e.target.value})}
                  placeholder="BotName" 
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Server Address</label>
                <input 
                  type="text" 
                  value={editForm.address}
                  onChange={(e) => setEditForm({...editForm, address: e.target.value})}
                  placeholder="mc.play.fun or 0.0.0.0:25565" 
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Version</label>
                <input 
                  type="text" 
                  value={editForm.version}
                  onChange={(e) => setEditForm({...editForm, version: e.target.value})}
                  placeholder="Auto" 
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors"
                />
              </div>
              
              <div className="flex items-center justify-between bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5">
                <label className="text-[13px] text-[#8b949e] font-medium cursor-pointer flex-1" htmlFor="editAutoJoinToggle">
                  Auto Join (Reconnect on kick/error)
                </label>
                <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                  <input 
                    type="checkbox" 
                    id="editAutoJoinToggle" 
                    checked={editForm.autoJoin}
                    onChange={(e) => setEditForm({...editForm, autoJoin: e.target.checked})}
                    className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 border-[#30363d] appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-5 checked:border-[#2ecc71]"
                  />
                  <label htmlFor="editAutoJoinToggle" className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${editForm.autoJoin ? 'bg-[#2ecc71]' : 'bg-[#30363d]'}`}></label>
                </div>
              </div>

              {editForm.autoJoin && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                  <label className="block text-[13px] text-[#8b949e] mb-1.5 font-medium">Auto Join Interval (sec)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={editForm.autoJoinInterval}
                    onChange={(e) => setEditForm({...editForm, autoJoinInterval: e.target.value})}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3498db] transition-colors"
                  />
                </div>
              )}

              <div className="flex items-center justify-between bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5">
                <label className="text-[13px] text-[#8b949e] font-medium cursor-pointer flex-1" htmlFor="editAutoStartToggle">
                  Auto Start (On Server Boot)
                </label>
                <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                  <input 
                    type="checkbox" 
                    id="editAutoStartToggle" 
                    checked={editForm.autoStart}
                    onChange={(e) => setEditForm({...editForm, autoStart: e.target.checked})}
                    className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 border-[#30363d] appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-5 checked:border-[#3498db]"
                  />
                  <label htmlFor="editAutoStartToggle" className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${editForm.autoStart ? 'bg-[#3498db]' : 'bg-[#30363d]'}`}></label>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setEditingBot(null)}
                  className="flex-1 bg-transparent border border-[#30363d] hover:bg-white/5 text-white font-semibold py-2.5 px-4 rounded-md transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#3498db] hover:bg-[#2980b9] text-white font-semibold py-2.5 px-4 rounded-md transition-colors text-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <style>{`
        .pixelated {
          image-rendering: pixelated;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #484f58;
        }
      `}</style>
    </div>
  );
}
