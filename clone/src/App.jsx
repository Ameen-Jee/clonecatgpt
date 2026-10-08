import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import gptLogo from "./assets/chatgpt.svg";
import addBtn from "./assets/add-30.png";
import msgIcon from "./assets/message.svg";
import homeIcon from "./assets/home.svg";
import proIcon from "./assets/rocket.svg";
import sendBtn from "./assets/send.svg";
import { fetchChatCompletionStream, API_KEY as INITIAL_KEY, DEFAULT_MODEL } from './services/api';

const STARTER_CARDS = [
  {
    icon: "💻",
    title: "Code & Debug",
    desc: "Write clean code or find bugs in your scripts",
    prompt: "Write a clean JavaScript function to sort an array of objects by property and explain how it works."
  },
  {
    icon: "🧠",
    title: "Explain Concepts",
    desc: "Break down complex topics into simple terms",
    prompt: "Explain how neural networks work using an intuitive real-world analogy."
  },
  {
    icon: "✍️",
    title: "Draft & Edit",
    desc: "Improve emails, essays, and creative writing",
    prompt: "Help me write a polite professional email asking for project feedback."
  },
  {
    icon: "🚀",
    title: "Brainstorm Ideas",
    desc: "Generate innovative ideas for startups or projects",
    prompt: "Give me 5 unique web application ideas using modern AI technologies."
  }
];

function App() {
  // Load saved chats from localStorage
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem('chatgpt_recent_chats');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const chatsEndRef = useRef(null);
  const inputRef = useRef(null);

  // Active chat session or empty array
  const activeChat = chats.find((c) => c.id === activeChatId);
  const messages = activeChat ? activeChat.messages : [];

  // Persist chats to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('chatgpt_recent_chats', JSON.stringify(chats));
    } catch (e) {
      console.error('Failed to save chat history', e);
    }
  }, [chats]);

  // Auto scroll to bottom when messages update
  useEffect(() => {
    chatsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (textToSend = input) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput('');
    setSidebarOpen(false);

    const userMessage = { id: Date.now().toString(), sender: 'user', text: trimmed };
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantPlaceholder = { id: assistantMessageId, sender: 'assistant', text: '' };

    let currentChatId = activeChatId;

    if (!currentChatId) {
      // Create new chat session
      const newId = Date.now().toString();
      const title = trimmed.length > 28 ? trimmed.slice(0, 28) + '...' : trimmed;
      const newChatObj = {
        id: newId,
        title: title,
        messages: [userMessage, assistantPlaceholder]
      };
      setChats((prev) => [newChatObj, ...prev]);
      setActiveChatId(newId);
      currentChatId = newId;
    } else {
      // Append to current chat session
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentChatId
            ? { ...chat, messages: [...chat.messages, userMessage, assistantPlaceholder] }
            : chat
        )
      );
    }

    setIsLoading(true);

    try {
      // Build conversation history for API request
      const existingMsgs = activeChat ? activeChat.messages : [];
      const history = [...existingMsgs, userMessage].map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      await fetchChatCompletionStream(
        history,
        (streamedText) => {
          setChats((prev) =>
            prev.map((chat) => {
              if (chat.id !== currentChatId) return chat;
              const updatedMsgs = chat.messages.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, text: streamedText } : msg
              );
              return { ...chat, messages: updatedMsgs };
            })
          );
        },
        INITIAL_KEY,
        DEFAULT_MODEL
      );
    } catch (err) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
      // Cleanup empty placeholder message if failed
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== currentChatId) return chat;
          const filteredMsgs = chat.messages.filter(
            (m) => m.id !== assistantMessageId || m.text.trim().length > 0
          );
          return { ...chat, messages: filteredMsgs };
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setError(null);
    setInput('');
    setSidebarOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleDeleteChat = (idToDelete, e) => {
    e.stopPropagation();
    setChats((prev) => prev.filter((c) => c.id !== idToDelete));
    if (activeChatId === idToDelete) {
      setActiveChatId(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="App">
      {/* Mobile Sidebar Backdrop Overlay */}
      {sidebarOpen && (
        <div className="sidebarBackdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`sideBar ${sidebarOpen ? 'mobileOpen' : ''}`}>
        <div className="upperSide">
          <div className="upperSideTop" onClick={handleNewChat}>
            <img src={gptLogo} alt="ChatGPT Logo" className="logo" />
            <span className="brand">ChatGPT</span>
            <span className="badge">Groq</span>
          </div>

          <button className="midBtn" onClick={handleNewChat}>
            <img src={addBtn} alt="New Chat" className="addBtn" />
            New Chat
          </button>

          <div className="sectionHeader">Recent Chats</div>
          <div className="upperSideBottom">
            {chats.length === 0 ? (
              <div className="noChats">No recent chats yet</div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`query ${activeChatId === chat.id ? 'activeChat' : ''}`}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setSidebarOpen(false);
                  }}
                  title={chat.title}
                >
                  <img src={msgIcon} alt="Chat Icon" />
                  <span className="chatTitleText">{chat.title}</span>
                  <button
                    className="deleteChatBtn"
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                    title="Delete Chat"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lowerSide">
          <button className="Home btns" onClick={handleNewChat}>
            <img src={homeIcon} alt="Home" />
            Home
          </button>
          <button className="UTP btns">
            <img src={proIcon} alt="Upgrade" className="proIcon" />
            Upgrade to Pro
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="main">
        {/* Header Bar */}
        <div className="chatHeader">
          <div className="headerLeft">
            <button
              className="mobileMenuBtn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Menu"
            >
              ☰
            </button>
            <div className="modelTag">
              <span className="statusDot"></span>
              <span>ChatGPT 4.0 (Groq)</span>
            </div>
          </div>
          <div className="headerActions">
            {messages.length > 0 && (
              <button className="clearBtn" onClick={handleNewChat}>
                + New Chat
              </button>
            )}
          </div>
        </div>

        {/* Content Body: Either Welcome View or Active Chat Messages */}
        {messages.length === 0 ? (
          <div className="HeadingDiv">
            <div className="welcomeWrapper">
              <img src={gptLogo} alt="ChatGPT" className="welcomeIcon" />
              <h1 className="Hello">Hi There...!</h1>
              <p className="subHeading">What would you like to explore or create today?</p>
            </div>

            <div className="cardsGrid">
              {STARTER_CARDS.map((card, idx) => (
                <div key={idx} className="promptCard" onClick={() => handleSend(card.prompt)}>
                  <div className="cardIcon">{card.icon}</div>
                  <div className="cardTitle">{card.title}</div>
                  <div className="cardDesc">{card.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="chatsContainer">
            {messages.map((msg) => (
              <div key={msg.id} className={`chatMessage ${msg.sender}`}>
                {msg.sender === 'assistant' && (
                  <div className="avatar assistant">
                    <img src={gptLogo} alt="ChatGPT Avatar" />
                  </div>
                )}
                <div className="msgContent">
                  <div className="msgBubble">
                    {msg.sender === 'assistant' ? (
                      msg.text ? (
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      ) : (
                        <div className="typingIndicator">
                          <div className="dot"></div>
                          <div className="dot"></div>
                          <div className="dot"></div>
                        </div>
                      )
                    ) : (
                      msg.text
                    )}
                  </div>
                  {msg.sender === 'assistant' && msg.text && (
                    <div className="msgMeta">
                      <button
                        className="copyBtn"
                        onClick={() => copyToClipboard(msg.text, msg.id)}
                      >
                        {copiedId === msg.id ? '✓ Copied' : '📋 Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatsEndRef} />
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="errorBanner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {/* Bottom Input Field */}
        <div className="bottomDiv">
          <div className="inp">
            <input
              ref={inputRef}
              placeholder="Ask ChatGPT..."
              className="inputField"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              className="sendBtn"
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
            >
              <img src={sendBtn} alt="Send" className="send" />
            </button>
          </div>
          <p className="mistakes">
            ChatGPT may produce inaccurate information about people, places or facts. Powered by Groq AI.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
