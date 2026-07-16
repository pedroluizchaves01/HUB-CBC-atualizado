import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, Settings, Eye, EyeOff, AlertCircle, CheckCircle, Info, Shield, RefreshCw } from 'lucide-react';
import { getTelegramConfig, saveTelegramConfig, sendTelegramTestMessage, maskToken } from '../lib/telegramService';

export function TelegramSettings() {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [fileNamePattern, setFileNamePattern] = useState('{centro} - {data} - {fornecedor} - {descricao} - {valor}');
  const [showToken, setShowToken] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: ''
  });
  
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: ''
  });

  // Fetch current Telegram settings on mount
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const data = await getTelegramConfig();
      setBotToken(maskToken(data.botToken));
      setChatId(data.chatId || '');
      setFileNamePattern(data.fileNamePattern || '{centro} - {data} - {fornecedor} - {descricao} - {valor}');
    } catch (error) {
      console.error('Erro ao buscar configuração do Telegram:', error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaveStatus({ type: null, message: '' });

    try {
      const data = await saveTelegramConfig({ botToken, chatId, password, fileNamePattern });
      setSaveStatus({
        type: 'success',
        message: data.message || 'Configuração salva com sucesso!'
      });
      // Clear password input on success
      setPassword('');
      // Refresh values to see masked token
      fetchConfig();
    } catch (error: any) {
      setSaveStatus({
        type: 'error',
        message: error.message || 'Erro ao salvar configuração.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestStatus({ type: null, message: '' });

    try {
      await sendTelegramTestMessage();
      setTestStatus({
        type: 'success',
        message: 'Conexão bem sucedida! Mensagem enviada para o grupo do Telegram.'
      });
    } catch (error: any) {
      setTestStatus({
        type: 'error',
        message: error.message || 'Erro de conexão.'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-2">
        <div>
          <h2 className="font-serif text-xl font-bold text-stone-900 flex items-center gap-2">
            <Settings className="text-[#FF5A35]" size={22} />
            Configurações do Banco de Dados
          </h2>
          <p className="text-xs font-mono text-stone-500 uppercase tracking-wide mt-1">
            Canal de Armazenamento Nuvem (Telegram) e Notificações Chaves Brites Correa
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: Form configuration */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-white border border-stone-200 p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <Shield size={16} className="text-stone-600" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-600">
                Credenciais de Autenticação do Bot
              </span>
            </div>

            <div className="space-y-4">
              {/* Bot Token input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wide text-stone-700">
                  Token do Telegram Bot
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="Ex: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    className="w-full bg-stone-50 border border-stone-200 text-xs py-2.5 pl-3 pr-10 focus:outline-hidden focus:border-[#FF5A35] focus:bg-white transition-all font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[10px] text-stone-400 leading-relaxed font-sans">
                  Gerado pelo <span className="font-mono text-[#FF5A35]">@BotFather</span> no Telegram após criar seu robô oficial.
                </p>
              </div>

              {/* Chat ID input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wide text-stone-700">
                  ID do Chat / Grupo (Chat ID)
                </label>
                <input
                  type="text"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="Ex: -100123456789"
                  className="w-full bg-stone-50 border border-stone-200 text-xs py-2.5 px-3 focus:outline-hidden focus:border-[#FF5A35] focus:bg-white transition-all font-mono"
                  required
                />
                <p className="text-[10px] text-stone-400 leading-relaxed font-sans">
                  O ID único do seu grupo do Telegram. Lembre-se de adicionar o Bot ao grupo como administrador.
                </p>
              </div>

              {/* Pattern Configuration */}
              <div className="space-y-3 pt-4 border-t border-stone-100">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-600">
                    Padrão de Nome do Arquivo (Telegram)
                  </span>
                </div>
                
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wide text-stone-700">
                    Formato de Nome de Exportação
                  </label>
                  <input
                    type="text"
                    value={fileNamePattern}
                    onChange={(e) => setFileNamePattern(e.target.value)}
                    placeholder="Ex: {centro} - {data} - {fornecedor} - {valor}"
                    className="w-full bg-stone-50 border border-stone-200 text-xs py-2.5 px-3 focus:outline-hidden focus:border-[#FF5A35] focus:bg-white transition-all font-mono"
                    required
                  />
                  <p className="text-[10px] text-stone-400 leading-relaxed font-sans">
                    Você pode usar placeholders dinâmicos que serão substituídos automaticamente na importação:
                  </p>
                  
                  {/* Presets and details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="bg-stone-50 p-2.5 border border-stone-200 text-[10px] space-y-1 font-mono text-stone-600">
                      <span className="font-bold text-stone-700 block uppercase tracking-wider text-[8px]">Placeholders Disponíveis:</span>
                      <div><strong className="text-[#FF5A35]">{`{centro}`}</strong>: Nome do Centro de Custo</div>
                      <div><strong className="text-[#FF5A35]">{`{data}`}</strong>: Data do Lançamento (AAAA-MM-DD)</div>
                      <div><strong className="text-[#FF5A35]">{`{fornecedor}`}</strong>: Nome do Fornecedor</div>
                      <div><strong className="text-[#FF5A35]">{`{descricao}`}</strong>: Descrição / Conteúdo</div>
                      <div><strong className="text-[#FF5A35]">{`{valor}`}</strong>: Valor Formato Moeda (ex: R$ 150,00)</div>
                    </div>

                    <div className="bg-stone-50 p-2.5 border border-stone-200 text-[10px] space-y-2 font-mono text-stone-600">
                      <span className="font-bold text-stone-700 block uppercase tracking-wider text-[8px]">Modelos Recomendados:</span>
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFileNamePattern('{centro} - {data} - {fornecedor} - {descricao} - {valor}')}
                          className="text-left text-stone-800 hover:text-[#FF5A35] underline text-[9px] cursor-pointer truncate"
                          title="{centro} - {data} - {fornecedor} - {descricao} - {valor}"
                        >
                          Padrão Completo CBC
                        </button>
                        <button
                          type="button"
                          onClick={() => setFileNamePattern('{centro} - {fornecedor} - {descricao}')}
                          className="text-left text-stone-800 hover:text-[#FF5A35] underline text-[9px] cursor-pointer truncate"
                          title="{centro} - {fornecedor} - {descricao}"
                        >
                          Centro, Fornecedor & Descrição
                        </button>
                        <button
                          type="button"
                          onClick={() => setFileNamePattern('{centro} - {descricao} - {valor}')}
                          className="text-left text-stone-800 hover:text-[#FF5A35] underline text-[9px] cursor-pointer truncate"
                          title="{centro} - {descricao} - {valor}"
                        >
                          Centro, Descrição & Valor
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live preview */}
                  <div className="bg-stone-50 border border-stone-200 p-2.5 mt-2">
                    <span className="block text-[8px] font-mono font-bold uppercase tracking-wider text-stone-500">
                      Visualização em Tempo Real (Exemplo):
                    </span>
                    <span className="block text-[11px] font-mono text-stone-800 mt-1 break-all select-all font-semibold">
                      {fileNamePattern
                        .replace(/{centro}/g, 'Casa Lagoa - Roberto')
                        .replace(/{data}/g, '2026-07-15')
                        .replace(/{fornecedor}/g, 'Leroy Merlin')
                        .replace(/{descricao}/g, 'Cimento CP-II')
                        .replace(/{valor}/g, 'R$ 150,00')
                      }.pdf
                    </span>
                  </div>
                </div>
              </div>

              {/* Password authorization input */}
              <div className="space-y-1.5 pt-2 border-t border-stone-100">
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wide text-stone-700 flex items-center gap-1.5">
                  <Shield size={12} className="text-[#FF5A35]" />
                  Senha de Autorização Administrativa
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite a senha master admin do sistema para autorizar"
                    className="w-full bg-stone-50 border border-stone-200 text-xs py-2.5 pl-3 pr-10 focus:outline-hidden focus:border-[#FF5A35] focus:bg-white transition-all font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[10px] text-stone-400 leading-relaxed font-sans">
                  Para salvar qualquer alteração nas credenciais do Banco de Dados, insira a senha master administrativa.
                </p>
              </div>
            </div>

            {saveStatus.type && (
              <div className={`p-4 flex items-start gap-2.5 border ${
                saveStatus.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {saveStatus.type === 'success' ? (
                  <CheckCircle size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="text-xs leading-relaxed">
                  <p className="font-bold">{saveStatus.type === 'success' ? 'Sucesso!' : 'Ocorreu um erro'}</p>
                  <p className="mt-0.5">{saveStatus.message}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-stone-950 hover:bg-stone-900 disabled:opacity-50 text-white font-mono text-[10px] font-bold py-2.5 px-5 uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                {loading && <RefreshCw size={12} className="animate-spin" />}
                Salvar Configurações
              </button>
              
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !chatId || !botToken}
                className="bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-800 font-mono text-[10px] font-bold py-2.5 px-5 uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-stone-200 cursor-pointer"
              >
                {testing ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <Send size={12} className="text-[#FF5A35]" />
                )}
                Testar Envio do Bot
              </button>
            </div>
          </form>

          {testStatus.type && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 flex items-start gap-2.5 border ${
                testStatus.type === 'success' 
                  ? 'bg-amber-50 border-amber-200 text-amber-900' 
                  : 'bg-rose-50 border-rose-200 text-rose-850'
              }`}
            >
              <Info size={16} className={testStatus.type === 'success' ? 'text-amber-700' : 'text-rose-600'} />
              <div className="text-xs font-sans">
                <span className="font-bold block uppercase tracking-wide text-[9px] font-mono text-stone-500">Resultado do Teste</span>
                <p className="mt-1 font-serif">{testStatus.message}</p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right column: Instructions Card */}
        <div className="space-y-4">
          <div className="bg-stone-50 border border-stone-200 p-5 space-y-4">
            <h3 className="font-serif text-sm font-bold text-stone-800 border-b border-stone-200 pb-2 flex items-center gap-1.5">
              <span>📋</span> Passo a Passo do Telegram
            </h3>
            
            <ol className="text-xs space-y-4 list-decimal pl-4 text-stone-600 font-sans leading-relaxed">
              <li>
                <strong className="text-stone-800">Crie seu Bot:</strong> Procure por <span className="font-mono bg-stone-200 px-1 text-stone-800">@BotFather</span> no Telegram e envie o comando <span className="font-mono bg-stone-200 px-1 text-stone-800">/newbot</span>. Siga os passos e copie o <span className="text-[#FF5A35] font-bold">Token de API</span> gerado.
              </li>
              <li>
                <strong className="text-stone-800">Crie seu Grupo:</strong> Crie um grupo no Telegram para os arquivos e relatórios da Chaves Brites Correa.
              </li>
              <li>
                <strong className="text-stone-800">Adicione o Bot:</strong> Adicione o seu Bot criado ao grupo como <strong className="text-stone-800">administrador</strong> com permissão para postar mensagens.
              </li>
              <li>
                <strong className="text-stone-800">Obtenha o Chat ID:</strong> 
                <p className="mt-1">
                  Adicione o bot <span className="font-mono bg-stone-200 px-1 text-stone-800">@RawDataBot</span> temporariamente ao seu grupo. Ele responderá com um JSON gigante contendo o ID do chat (geralmente começa com <span className="font-mono">-100...</span>). Copie esse ID completo (com o sinal negativo). Depois, pode remover o RawDataBot do grupo.
                </p>
              </li>
              <li>
                <strong className="text-stone-800">Cole e Salve:</strong> Insira os dois valores no formulário à esquerda e clique em <strong className="text-stone-800">Salvar</strong>. Use o botão <strong className="text-stone-800">Testar Envio</strong> para certificar-se de que está tudo operacional!
              </li>
            </ol>
          </div>

          <div className="bg-[#FF5A35]/5 border border-[#FF5A35]/15 p-4 flex items-start gap-2.5">
            <span className="text-[#FF5A35] text-sm mt-0.5">ℹ️</span>
            <p className="text-[10px] text-stone-600 leading-relaxed font-sans">
              <strong className="text-stone-800">Segurança de Dados:</strong> O token é guardado e criptografado localmente no nosso servidor. Seus clientes terão acesso aos anexos através do painel, mas nunca poderão visualizar seu token de acesso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
