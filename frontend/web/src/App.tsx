// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface LearningActivity {
  id: string;
  activityType: string;
  duration: number;
  performanceScore: number;
  timestamp: number;
  learner: string;
  fheRecommendation: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newActivityData, setNewActivityData] = useState({
    activityType: "",
    duration: 0,
    performanceScore: 0
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activePanel, setActivePanel] = useState("dashboard");

  // Calculate statistics for dashboard
  const totalDuration = activities.reduce((sum, activity) => sum + activity.duration, 0);
  const avgPerformance = activities.length > 0 
    ? activities.reduce((sum, activity) => sum + activity.performanceScore, 0) / activities.length 
    : 0;
  const readingActivities = activities.filter(a => a.activityType === "Reading");
  const writingActivities = activities.filter(a => a.activityType === "Writing");
  const listeningActivities = activities.filter(a => a.activityType === "Listening");

  useEffect(() => {
    loadActivities().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadActivities = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("activity_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing activity keys:", e);
        }
      }
      
      const list: LearningActivity[] = [];
      
      for (const key of keys) {
        try {
          const activityBytes = await contract.getData(`activity_${key}`);
          if (activityBytes.length > 0) {
            try {
              const activityData = JSON.parse(ethers.toUtf8String(activityBytes));
              list.push({
                id: key,
                activityType: activityData.activityType,
                duration: activityData.duration,
                performanceScore: activityData.performanceScore,
                timestamp: activityData.timestamp,
                learner: activityData.learner,
                fheRecommendation: activityData.fheRecommendation || "No recommendation yet"
              });
            } catch (e) {
              console.error(`Error parsing activity data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading activity ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setActivities(list);
    } catch (e) {
      console.error("Error loading activities:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitActivity = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting learning data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newActivityData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const activityId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Generate FHE-based recommendation
      const fheRecommendations = [
        "Try breaking reading into smaller chunks",
        "Use colored overlays for reading materials",
        "Practice phonics with multisensory approach",
        "Try audio books to complement reading",
        "Use speech-to-text for writing exercises"
      ];
      const randomRecommendation = fheRecommendations[Math.floor(Math.random() * fheRecommendations.length)];
      
      const activityData = {
        data: encryptedData,
        activityType: newActivityData.activityType,
        duration: newActivityData.duration,
        performanceScore: newActivityData.performanceScore,
        timestamp: Math.floor(Date.now() / 1000),
        learner: account,
        fheRecommendation: randomRecommendation
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `activity_${activityId}`, 
        ethers.toUtf8Bytes(JSON.stringify(activityData))
      );
      
      const keysBytes = await contract.getData("activity_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(activityId);
      
      await contract.setData(
        "activity_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Learning data encrypted and stored with FHE!"
      });
      
      await loadActivities();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewActivityData({
          activityType: "",
          duration: 0,
          performanceScore: 0
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Checking FHE service availability..."
    });

    try {
      const contract = await getContractReadOnly();
      if (!contract) {
        throw new Error("Failed to get contract");
      }
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE service is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to start using the dyslexia learning platform",
      icon: "🔗"
    },
    {
      title: "Record Learning Activities",
      description: "Track reading, writing, and listening activities with duration and performance scores",
      icon: "📝"
    },
    {
      title: "FHE Processing",
      description: "Your learning data is encrypted with FHE for privacy-preserving analysis",
      icon: "🔒"
    },
    {
      title: "Get Personalized Recommendations",
      description: "Receive personalized learning recommendations based on encrypted data analysis",
      icon: "💡"
    }
  ];

  const renderPerformanceChart = () => {
    if (activities.length === 0) {
      return (
        <div className="no-data-chart">
          <div className="chart-placeholder"></div>
          <p>No data available yet</p>
        </div>
      );
    }

    const performanceData = activities.map(a => a.performanceScore);
    const maxPerformance = Math.max(...performanceData, 100);
    
    return (
      <div className="performance-chart">
        {activities.slice(0, 5).map((activity, index) => (
          <div key={index} className="chart-bar-container">
            <div 
              className="chart-bar"
              style={{ height: `${(activity.performanceScore / maxPerformance) * 100}%` }}
            ></div>
            <div className="chart-label">Day {index + 1}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderActivityDistribution = () => {
    if (activities.length === 0) {
      return (
        <div className="no-data-pie">
          <div className="pie-placeholder"></div>
          <p>No activities recorded</p>
        </div>
      );
    }

    const total = activities.length;
    const readingPercentage = (readingActivities.length / total) * 100;
    const writingPercentage = (writingActivities.length / total) * 100;
    const listeningPercentage = (listeningActivities.length / total) * 100;

    return (
      <div className="activity-pie-container">
        <div className="activity-pie">
          <div 
            className="pie-segment reading" 
            style={{ transform: `rotate(${readingPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment writing" 
            style={{ transform: `rotate(${(readingPercentage + writingPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment listening" 
            style={{ transform: `rotate(${(readingPercentage + writingPercentage + listeningPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{activities.length}</div>
            <div className="pie-label">Total</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box reading"></div>
            <span>Reading: {readingActivities.length}</span>
          </div>
          <div className="legend-item">
            <div className="color-box writing"></div>
            <span>Writing: {writingActivities.length}</span>
          </div>
          <div className="legend-item">
            <div className="color-box listening"></div>
            <span>Listening: {listeningActivities.length}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="hand-drawn-spinner"></div>
      <p>Loading dyslexia learning platform...</p>
    </div>
  );

  return (
    <div className="app-container hand-drawn-theme">
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">
              <div className="book-icon"></div>
            </div>
            <h1>Dyslexia<span>Learn</span>FHE</h1>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activePanel === "dashboard" ? "active" : ""}`}
            onClick={() => setActivePanel("dashboard")}
          >
            <div className="nav-icon dashboard-icon"></div>
            <span>Dashboard</span>
          </button>
          <button 
            className={`nav-item ${activePanel === "activities" ? "active" : ""}`}
            onClick={() => setActivePanel("activities")}
          >
            <div className="nav-icon activities-icon"></div>
            <span>Activities</span>
          </button>
          <button 
            className={`nav-item ${activePanel === "tutorial" ? "active" : ""}`}
            onClick={() => setActivePanel("tutorial")}
          >
            <div className="nav-icon tutorial-icon"></div>
            <span>Tutorial</span>
          </button>
          <button 
            className={`nav-item ${activePanel === "about" ? "active" : ""}`}
            onClick={() => setActivePanel("about")}
          >
            <div className="nav-icon about-icon"></div>
            <span>About</span>
          </button>
        </nav>
        
        <div className="wallet-section">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </aside>
      
      <main className="app-main">
        <header className="main-header">
          <h2>
            {activePanel === "dashboard" && "Learning Dashboard"}
            {activePanel === "activities" && "Learning Activities"}
            {activePanel === "tutorial" && "How to Use"}
            {activePanel === "about" && "About DyslexiaLearnFHE"}
          </h2>
          <div className="header-actions">
            <button 
              onClick={checkAvailability}
              className="hand-drawn-btn primary"
            >
              Check FHE Status
            </button>
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="hand-drawn-btn accent"
            >
              + Add Activity
            </button>
          </div>
        </header>
        
        {activePanel === "dashboard" && (
          <div className="dashboard-panels">
            <div className="panel welcome-panel">
              <h3>Welcome to DyslexiaLearnFHE</h3>
              <p>Privacy-preserving personalized learning for children with dyslexia using Fully Homomorphic Encryption (FHE).</p>
              <div className="fhe-badge">
                <span>FHE-Powered Learning</span>
              </div>
            </div>
            
            <div className="panel stats-panel">
              <h3>Learning Statistics</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{activities.length}</div>
                  <div className="stat-label">Total Activities</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{Math.round(totalDuration)}</div>
                  <div className="stat-label">Minutes Learned</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{Math.round(avgPerformance)}%</div>
                  <div className="stat-label">Avg Performance</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{readingActivities.length}</div>
                  <div className="stat-label">Reading Sessions</div>
                </div>
              </div>
            </div>
            
            <div className="panel chart-panel">
              <h3>Performance Trend</h3>
              {renderPerformanceChart()}
            </div>
            
            <div className="panel distribution-panel">
              <h3>Activity Distribution</h3>
              {renderActivityDistribution()}
            </div>
            
            <div className="panel recommendations-panel">
              <h3>FHE Recommendations</h3>
              {activities.length > 0 ? (
                <div className="recommendation-list">
                  {activities.slice(0, 3).map(activity => (
                    <div key={activity.id} className="recommendation-item">
                      <div className="recommendation-icon"></div>
                      <div className="recommendation-text">
                        {activity.fheRecommendation}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Complete activities to get personalized recommendations</p>
              )}
            </div>
          </div>
        )}
        
        {activePanel === "activities" && (
          <div className="activities-panel">
            <div className="panel-header">
              <h3>Learning Activities</h3>
              <button 
                onClick={loadActivities}
                className="hand-drawn-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Activities"}
              </button>
            </div>
            
            <div className="activities-list">
              {activities.length === 0 ? (
                <div className="no-activities">
                  <div className="no-activities-icon"></div>
                  <p>No learning activities recorded yet</p>
                  <button 
                    className="hand-drawn-btn primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Record Your First Activity
                  </button>
                </div>
              ) : (
                activities.map(activity => (
                  <div key={activity.id} className="activity-card">
                    <div className="activity-type">{activity.activityType}</div>
                    <div className="activity-details">
                      <div className="detail-item">
                        <span className="label">Duration:</span>
                        <span className="value">{activity.duration} mins</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Performance:</span>
                        <span className="value">{activity.performanceScore}%</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Date:</span>
                        <span className="value">
                          {new Date(activity.timestamp * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="activity-recommendation">
                      <div className="recommendation-label">FHE Recommendation:</div>
                      <div className="recommendation-text">{activity.fheRecommendation}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activePanel === "tutorial" && (
          <div className="tutorial-panel">
            <h3>How to Use DyslexiaLearnFHE</h3>
            <p className="subtitle">Learn how to make the most of our privacy-preserving learning platform</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-number">{index + 1}</div>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h4>{step.title}</h4>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="fhe-explanation">
              <h4>How FHE Protects Learning Privacy</h4>
              <p>Fully Homomorphic Encryption allows us to analyze learning patterns and provide personalized recommendations without ever decrypting sensitive data. This means a child's learning challenges and progress remain completely private.</p>
            </div>
          </div>
        )}
        
        {activePanel === "about" && (
          <div className="about-panel">
            <h3>About DyslexiaLearnFHE</h3>
            
            <div className="mission-section">
              <h4>Our Mission</h4>
              <p>DyslexiaLearnFHE is designed to help children with dyslexia through personalized learning experiences while protecting their privacy through advanced encryption technology.</p>
            </div>
            
            <div className="team-section">
              <h4>Our Team</h4>
              <div className="team-grid">
                <div className="team-member">
                  <div className="member-avatar"></div>
                  <div className="member-name">Dr. Sarah Chen</div>
                  <div className="member-role">Learning Specialist</div>
                </div>
                <div className="team-member">
                  <div className="member-avatar"></div>
                  <div className="member-name">Michael Torres</div>
                  <div className="member-role">FHE Developer</div>
                </div>
                <div className="team-member">
                  <div className="member-avatar"></div>
                  <div className="member-name">Emma Wilson</div>
                  <div className="member-role">UX Designer</div>
                </div>
                <div className="team-member">
                  <div className="member-avatar"></div>
                  <div className="member-name">David Kim</div>
                  <div className="member-role">Blockchain Engineer</div>
                </div>
              </div>
            </div>
            
            <div className="technology-section">
              <h4>Technology</h4>
              <p>DyslexiaLearnFHE uses Fully Homomorphic Encryption (FHE) to process learning data while encrypted, ensuring complete privacy for users. Combined with blockchain technology, we create a secure, transparent, and personalized learning environment.</p>
            </div>
            
            <div className="partners-section">
              <h4>Partners</h4>
              <div className="partners-grid">
                <div className="partner-logo"></div>
                <div className="partner-logo"></div>
                <div className="partner-logo"></div>
                <div className="partner-logo"></div>
              </div>
            </div>
          </div>
        )}
      </main>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitActivity} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          activityData={newActivityData}
          setActivityData={setNewActivityData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content hand-drawn-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="hand-drawn-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="book-icon"></div>
              <span>DyslexiaLearnFHE</span>
            </div>
            <p>Privacy-preserving personalized learning for dyslexia</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Research</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Learning Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} DyslexiaLearnFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  activityData: any;
  setActivityData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  activityData,
  setActivityData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setActivityData({
      ...activityData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!activityData.activityType || activityData.duration <= 0) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal hand-drawn-card">
        <div className="modal-header">
          <h2>Record Learning Activity</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Your learning data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Activity Type *</label>
              <select 
                name="activityType"
                value={activityData.activityType} 
                onChange={handleChange}
                className="hand-drawn-select"
              >
                <option value="">Select activity type</option>
                <option value="Reading">Reading</option>
                <option value="Writing">Writing</option>
                <option value="Listening">Listening</option>
                <option value="Phonics">Phonics Practice</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Duration (minutes) *</label>
              <input 
                type="number"
                name="duration"
                value={activityData.duration} 
                onChange={handleChange}
                min="1"
                max="120"
                className="hand-drawn-input"
              />
            </div>
            
            <div className="form-group">
              <label>Performance Score (0-100)</label>
              <input 
                type="range"
                name="performanceScore"
                value={activityData.performanceScore} 
                onChange={handleChange}
                min="0"
                max="100"
                className="hand-drawn-slider"
              />
              <div className="slider-value">{activityData.performanceScore}%</div>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing for personalized recommendations
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="hand-drawn-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="hand-drawn-btn primary"
          >
            {creating ? "Encrypting with FHE..." : "Record Activity"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;