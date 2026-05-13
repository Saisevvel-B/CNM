import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { supabase, getUserId } from "./supabase";

// ─────────────────────────────────────────────
// Category icons (unchanged)
// ─────────────────────────────────────────────
const categoryIcons = {
  Food: new L.DivIcon({
    className: "custom-pin food-pin",
    html: "<div class='pin-icon'>🍽️</div><div class='pin-shadow'></div>",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  }),
  Transport: new L.DivIcon({
    className: "custom-pin transport-pin",
    html: "<div class='pin-icon'>🚌</div><div class='pin-shadow'></div>",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  }),
  Medical: new L.DivIcon({
    className: "custom-pin medical-pin",
    html: "<div class='pin-icon'>🏥</div><div class='pin-shadow'></div>",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  }),
  Snacks: new L.DivIcon({
    className: "custom-pin snacks-pin",
    html: "<div class='pin-icon'>🍿</div><div class='pin-shadow'></div>",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  }),
  Bakery: new L.DivIcon({
    className: "custom-pin bakery-pin",
    html: "<div class='pin-icon'>🥖</div><div class='pin-shadow'></div>",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  }),
  Clothing: new L.DivIcon({
    className: "custom-pin clothing-pin",
    html: "<div class='pin-icon'>👕</div><div class='pin-shadow'></div>",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  }),
  Education: new L.DivIcon({
    className: "custom-pin education-pin",
    html: "<div class='pin-icon'>📚</div><div class='pin-shadow'></div>",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  }),
  Other: new L.DivIcon({
    className: "custom-pin other-pin",
    html: "<div class='pin-icon'>📍</div><div class='pin-shadow'></div>",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  }),
};

const categoryColors = {
  Food: "#e74c3c",
  Transport: "#3498db",
  Medical: "#2ecc71",
  Snacks: "#f39c12",
  Bakery: "#9b59b6",
  Clothing: "#e67e22",
  Education: "#1abc9c",
  Other: "#95a5a6",
};

// ─────────────────────────────────────────────
// DistanceInfo Component (unchanged)
// ─────────────────────────────────────────────
function DistanceInfo({ distance, isVisible, onClose }) {
  if (!isVisible) return null;
  return (
    <div className={`distance-info ${!isVisible ? "hidden" : ""}`}>
      <div className="distance-info-icon">🚶</div>
      <div className="distance-info-content">
        <span className="distance-value">{distance} km</span>
        <span className="distance-label">distance to destination</span>
      </div>
      <button className="distance-info-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main App Component
// ─────────────────────────────────────────────
export default function App() {
  const [pins, setPins] = useState([]);
  const [newPin, setNewPin] = useState(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Food");
  const [userLocation, setUserLocation] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [mapCenter, setMapCenter] = useState([51.505, -0.09]);

  // upvotes: { [pinId]: count }
  const [upvotes, setUpvotes] = useState({});
  // upvotedByMe: Set of pin IDs the current user has already upvoted
  const [upvotedByMe, setUpvotedByMe] = useState(new Set());
  // comments: { [pinId]: [{ id, text, user_id, created_at }] }
  const [comments, setComments] = useState({});

  const [userComment, setUserComment] = useState("");
  const [activeFilters, setActiveFilters] = useState([]);
  const [viewMode, setViewMode] = useState("map");
  const [sortOption, setSortOption] = useState("newest");
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [route, setRoute] = useState(null);
  const [distance, setDistance] = useState(null);
  const [destinationPin, setDestinationPin] = useState(null);
  const [showDistanceInfo, setShowDistanceInfo] = useState(false);
  const mapRef = useRef(null);

  const userId = getUserId();

  // ─── Simple notification helper (unchanged) ───
  const showNotification = (message, type = "success") => {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add("show"), 10);
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
  };

  // ─── Load all pins + upvote counts + comments from Supabase ───
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        // 1. Fetch all pins
        const { data: pinsData, error: pinsError } = await supabase
          .from("pins")
          .select("*")
          .order("created_at", { ascending: false });

        if (pinsError) throw pinsError;

        // 2. Fetch all upvotes
        const { data: upvotesData, error: upvotesError } = await supabase
          .from("upvotes")
          .select("pin_id, user_id");

        if (upvotesError) throw upvotesError;

        // 3. Fetch all comments
        const { data: commentsData, error: commentsError } = await supabase
          .from("comments")
          .select("*")
          .order("created_at", { ascending: true });

        if (commentsError) throw commentsError;

        // Shape pins to match the existing UI expectations:
        // UI expects: { id, position: { lat, lng }, description, category, timestamp, createdBy }
        const shapedPins = (pinsData || []).map((p) => ({
          id: p.id,
          position: { lat: p.lat, lng: p.lng },
          description: p.description,
          category: p.category,
          timestamp: new Date(p.created_at).toLocaleString(),
          createdBy: p.user_id === userId ? "You" : "Community",
          user_id: p.user_id,
        }));

        // Build upvote counts map and track which ones the current user voted on
        const upvoteCountMap = {};
        const myUpvotedSet = new Set();
        (upvotesData || []).forEach((uv) => {
          upvoteCountMap[uv.pin_id] = (upvoteCountMap[uv.pin_id] || 0) + 1;
          if (uv.user_id === userId) myUpvotedSet.add(uv.pin_id);
        });

        // Build comments map: { pinId: [comment, ...] }
        const commentsMap = {};
        (commentsData || []).forEach((c) => {
          if (!commentsMap[c.pin_id]) commentsMap[c.pin_id] = [];
          commentsMap[c.pin_id].push({
            id: c.id,
            text: c.text,
            author: c.user_id === userId ? "You" : "Community",
            timestamp: new Date(c.created_at).toLocaleString(),
          });
        });

        setPins(shapedPins);
        setUpvotes(upvoteCountMap);
        setUpvotedByMe(myUpvotedSet);
        setComments(commentsMap);
      } catch (err) {
        console.error("Error loading data:", err);
        showNotification("Error loading data from server", "error");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // ─── Get user's geolocation ───
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = [position.coords.latitude, position.coords.longitude];
        setUserLocation(location);
        setMapCenter(location);
      },
      () => {
        console.error("Unable to retrieve location");
      }
    );
  }, []);

  // ─── Supabase real-time subscription for live updates ───
  useEffect(() => {
    // Listen for new pins inserted by other users
    const pinsChannel = supabase
      .channel("realtime-pins")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pins" },
        (payload) => {
          const p = payload.new;
          // Avoid adding your own pin twice (already added optimistically)
          if (p.user_id === userId) return;
          const shaped = {
            id: p.id,
            position: { lat: p.lat, lng: p.lng },
            description: p.description,
            category: p.category,
            timestamp: new Date(p.created_at).toLocaleString(),
            createdBy: "Community",
            user_id: p.user_id,
          };
          setPins((prev) => [shaped, ...prev]);
          showNotification("A new community pin was added!");
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "pins" },
        (payload) => {
          setPins((prev) => prev.filter((pin) => pin.id !== payload.old.id));
        }
      )
      .subscribe();

    // Listen for new comments
    const commentsChannel = supabase
      .channel("realtime-comments")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (payload) => {
          const c = payload.new;
          if (c.user_id === userId) return; // Already added optimistically
          setComments((prev) => ({
            ...prev,
            [c.pin_id]: [
              ...(prev[c.pin_id] || []),
              {
                id: c.id,
                text: c.text,
                author: "Community",
                timestamp: new Date(c.created_at).toLocaleString(),
              },
            ],
          }));
        }
      )
      .subscribe();

    // Listen for new upvotes
    const upvotesChannel = supabase
      .channel("realtime-upvotes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "upvotes" },
        (payload) => {
          const uv = payload.new;
          if (uv.user_id === userId) return; // Already added optimistically
          setUpvotes((prev) => ({
            ...prev,
            [uv.pin_id]: (prev[uv.pin_id] || 0) + 1,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(pinsChannel);
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(upvotesChannel);
    };
  }, []);

  // ─── Filter & sort (logic unchanged) ───
  const filteredPins = useMemo(() => {
    if (activeFilters.length === 0) return pins;
    return pins.filter((pin) => activeFilters.includes(pin.category));
  }, [pins, activeFilters]);

  const sortedPins = useMemo(() => {
    switch (sortOption) {
      case "newest":
        return [...filteredPins].sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
      case "oldest":
        return [...filteredPins].sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );
      case "mostUpvoted":
        return [...filteredPins].sort(
          (a, b) => (upvotes[b.id] || 0) - (upvotes[a.id] || 0)
        );
      case "mostDiscussed":
        return [...filteredPins].sort(
          (a, b) =>
            (comments[b.id]?.length || 0) - (comments[a.id]?.length || 0)
        );
      default:
        return filteredPins;
    }
  }, [filteredPins, sortOption, upvotes, comments]);

  // ─── Route fetching (unchanged) ───
  const fetchRoute = async (pinPosition) => {
    if (!userLocation || !pinPosition) return;
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${userLocation[1]},${userLocation[0]};${pinPosition.lng},${pinPosition.lat}?overview=full&geometries=geojson`
      );
      const data = await response.json();
      if (data.routes && data.routes[0]) {
        setRoute(
          data.routes[0].geometry.coordinates.map((coord) => [
            coord[1],
            coord[0],
          ])
        );
        setDistance((data.routes[0].distance / 1000).toFixed(2));
      } else {
        showNotification("Unable to calculate route", "error");
      }
    } catch (error) {
      console.error("Error fetching route:", error);
      showNotification("Error calculating route", "error");
    }
  };

  useEffect(() => {
    if (!destinationPin) {
      setRoute(null);
      setDistance(null);
      setShowDistanceInfo(false);
    }
  }, [destinationPin]);

  const handleDestinationSelect = (pin) => {
    setDestinationPin(pin);
    fetchRoute(pin.position);
    setShowDistanceInfo(true);
  };

  // ─── Search location (unchanged) ───
  const handleSearchLocation = async () => {
    if (!searchTerm) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${searchTerm}`
      );
      const data = await response.json();
      if (data.length > 0) {
        const newCenter = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        setMapCenter(newCenter);
      } else {
        showNotification("Location not found", "error");
      }
    } catch (error) {
      console.error("Error fetching location data", error);
      showNotification("Error searching location", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Add a new pin — now saves to Supabase ───
  const handleAddPin = async () => {
    if (!newPin || !description) return;

    // // Check 5-pin limit for this user
    // const { count, error: countError } = await supabase
    //   .from("pins")
    //   .select("*", { count: "exact", head: true })
    //   .eq("user_id", userId);

    // if (countError) {
    //   showNotification("Error checking pin limit", "error");
    //   return;
    // }

    // if (count >= 5) {
    //   showNotification("You've reached the 5-pin limit!", "error");
    //   return;
    // }

    const { data, error } = await supabase
      .from("pins")
      .insert({
        user_id: userId,
        description,
        category,
        lat: newPin.lat,
        lng: newPin.lng,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding pin:", error);
      showNotification("Error adding pin", "error");
      return;
    }

    // Optimistically add to local state
    const shaped = {
      id: data.id,
      position: { lat: data.lat, lng: data.lng },
      description: data.description,
      category: data.category,
      timestamp: new Date(data.created_at).toLocaleString(),
      createdBy: "You",
      user_id: data.user_id,
    };
    setPins((prev) => [shaped, ...prev]);
    setUpvotes((prev) => ({ ...prev, [data.id]: 0 }));
    setComments((prev) => ({ ...prev, [data.id]: [] }));
    setNewPin(null);
    setDescription("");
    showNotification("Pin added successfully!");
  };

  // ─── Upvote — now saves to Supabase (one vote per user per pin) ───
  const handleUpvote = async (pinId) => {
    if (upvotedByMe.has(pinId)) {
      showNotification("You already upvoted this pin!", "error");
      return;
    }

    const { error } = await supabase
      .from("upvotes")
      .insert({ pin_id: pinId, user_id: userId });

    if (error) {
      // Unique constraint violation means already voted
      if (error.code === "23505") {
        showNotification("You already upvoted this pin!", "error");
      } else {
        console.error("Error upvoting:", error);
        showNotification("Error saving upvote", "error");
      }
      return;
    }

    // Optimistic update
    setUpvotes((prev) => ({ ...prev, [pinId]: (prev[pinId] || 0) + 1 }));
    setUpvotedByMe((prev) => new Set([...prev, pinId]));
  };

  // ─── Add comment — now saves to Supabase ───
  const handleAddComment = async (pinId) => {
    if (!userComment.trim()) return;

    const { data, error } = await supabase
      .from("comments")
      .insert({
        pin_id: pinId,
        user_id: userId,
        text: userComment.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding comment:", error);
      showNotification("Error saving comment", "error");
      return;
    }

    // Optimistic update
    setComments((prev) => ({
      ...prev,
      [pinId]: [
        ...(prev[pinId] || []),
        {
          id: data.id,
          text: data.text,
          author: "You",
          timestamp: new Date(data.created_at).toLocaleString(),
        },
      ],
    }));
    setUserComment("");
  };

  // ─── Delete pin — now deletes from Supabase ───
  const handleDeletePin = async (id) => {
    const pin = pins.find((p) => p.id === id);
    if (!pin) return;

    // Only allow deleting your own pins
    if (pin.user_id !== userId) {
      showNotification("You can only delete your own pins", "error");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this pin?")) return;

    const { error } = await supabase.from("pins").delete().eq("id", id);

    if (error) {
      console.error("Error deleting pin:", error);
      showNotification("Error deleting pin", "error");
      return;
    }

    // Optimistic local update
    setPins((prev) => prev.filter((p) => p.id !== id));
    setUpvotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setComments((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    showNotification("Pin deleted successfully");
  };

  // ─── Filter toggle (unchanged) ───
  const handleFilterToggle = (cat) => {
    setActiveFilters((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // ─── Center on user location (unchanged) ───
  const centerOnUserLocation = useCallback(() => {
    if (userLocation) {
      setMapCenter(userLocation);
      if (destinationPin) {
        const dest = destinationPin;
        fetchRoute(dest.position);
      }
      showNotification("Centered on your location");
    } else {
      showNotification("Unable to get your location", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, destinationPin]);

  // ─── Map sub-components (unchanged) ───
  function LocationMarker() {
    useMapEvents({
      click(e) {
        setNewPin(e.latlng);
      },
    });
    return newPin ? (
      <Marker position={newPin} icon={categoryIcons[category]}>
        <Popup>{description || "New Pin Location"}</Popup>
      </Marker>
    ) : null;
  }

  function ChangeView({ center, bounds }) {
    const map = useMap();
    mapRef.current = map;
    useEffect(() => {
      if (center && !bounds) map.setView(center, 14);
      else if (bounds) map.fitBounds(bounds, { padding: [50, 50] });
    }, [center, bounds, map]);
    return null;
  }

  // ─────────────────────────────────────────────
  // JSX — completely unchanged from original
  // ─────────────────────────────────────────────
  return (
    <div className="app-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      )}

      <div className="app-header">
        <div className="logo">
          <span className="logo-icon">🗺️</span>
          <h1>Community Needs Map</h1>
        </div>
        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewMode === "map" ? "active" : ""}`}
            onClick={() => setViewMode("map")}
          >
            🗺️ Map View
          </button>
          <button
            className={`toggle-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setViewMode("list")}
          >
            📋 List View
          </button>
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? "👈 Hide" : "👉 Menu"}
        </button>
      </div>

      <div className="app-content">
        <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
          <div className="form-section">
            <h2>📍 Add a Missing Service</h2>
            <div className="search-container">
              <input
                type="text"
                placeholder="Search for a place..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-bar"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearchLocation();
                }}
              />
              <button onClick={handleSearchLocation} className="search-btn">
                🔍
              </button>
            </div>

            <button
              onClick={centerOnUserLocation}
              className="location-btn"
              disabled={!userLocation}
            >
              📍 Go to My Location
            </button>

            <button
              onClick={() => userLocation && setNewPin(userLocation)}
              className="pin-current-btn"
              disabled={!userLocation}
            >
              📌 Pin My Current Location
            </button>

            {newPin && (
              <div className="new-pin-form">
                <h3>New Pin Details</h3>
                <input
                  type="text"
                  placeholder="Describe the missing service"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input-field"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="category-select"
                  style={{ borderColor: categoryColors[category] }}
                >
                  {Object.keys(categoryIcons).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddPin}
                  className="add-pin-btn"
                  disabled={!description}
                >
                  ✅ Add Need
                </button>
                <button onClick={() => setNewPin(null)} className="cancel-btn">
                  ❌ Cancel
                </button>
              </div>
            )}

            <div className="filters-section">
              <h3>Filter by Category</h3>
              <div className="filter-options">
                {Object.keys(categoryIcons).map((cat) => (
                  <button
                    key={cat}
                    className={`filter-btn ${
                      activeFilters.includes(cat) ? "active" : ""
                    }`}
                    style={{
                      backgroundColor: activeFilters.includes(cat)
                        ? categoryColors[cat]
                        : "#f0f0f0",
                      color: activeFilters.includes(cat) ? "white" : "#333",
                    }}
                    onClick={() => handleFilterToggle(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="sort-section">
              <h3>Sort Pins</h3>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="sort-select"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="mostUpvoted">Most Upvoted</option>
                <option value="mostDiscussed">Most Discussed</option>
              </select>
            </div>

            <div className="stats-section">
              <h3>Community Stats</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-value">{pins.length}</span>
                  <span className="stat-label">Total Pins</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {Object.values(upvotes).reduce(
                      (sum, val) => sum + val,
                      0
                    )}
                  </span>
                  <span className="stat-label">Total Upvotes</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {Object.values(comments).reduce(
                      (sum, arr) => sum + arr.length,
                      0
                    )}
                  </span>
                  <span className="stat-label">Total Comments</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="main-content">
          {viewMode === "map" ? (
            <div className="map-section">
              <MapContainer
                center={mapCenter}
                zoom={14}
                className="map-container"
              >
                <ChangeView center={mapCenter} />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {userLocation && (
                  <>
                    <Marker
                      position={userLocation}
                      icon={
                        new L.DivIcon({
                          className: "user-location-marker",
                          html: "<div class='pulse'></div><div class='user-dot'></div>",
                          iconSize: [20, 20],
                          iconAnchor: [10, 10],
                        })
                      }
                    >
                      <Popup>You are here</Popup>
                    </Marker>
                    <Circle
                      center={userLocation}
                      radius={500}
                      pathOptions={{
                        color: "#4a69dd",
                        fillColor: "#4a69dd",
                        fillOpacity: 0.1,
                      }}
                    />
                  </>
                )}

                <LocationMarker />

                {sortedPins.map((pin) => (
                  <Marker
                    key={pin.id}
                    position={pin.position}
                    icon={categoryIcons[pin.category]}
                    eventHandlers={{
                      click: () => handleDestinationSelect(pin),
                    }}
                  >
                    <Popup className="enhanced-popup">
                      <div
                        className="popup-header"
                        style={{
                          backgroundColor: categoryColors[pin.category],
                        }}
                      >
                        <span className="popup-category">{pin.category}</span>
                        <div className="popup-actions">
                          <button
                            className="upvote-btn"
                            onClick={() => handleUpvote(pin.id)}
                            style={{
                              opacity: upvotedByMe.has(pin.id) ? 0.6 : 1,
                              cursor: upvotedByMe.has(pin.id)
                                ? "not-allowed"
                                : "pointer",
                            }}
                            title={
                              upvotedByMe.has(pin.id)
                                ? "Already upvoted"
                                : "Upvote"
                            }
                          >
                            👍 {upvotes[pin.id] || 0}
                          </button>
                          {pin.user_id === userId && (
                            <button
                              className="delete-btn"
                              onClick={() => handleDeletePin(pin.id)}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="popup-content">
                        <h3>{pin.description}</h3>
                        <div className="popup-meta">
                          <span>Added by: {pin.createdBy}</span>
                          <span>Added: {pin.timestamp}</span>
                        </div>

                        <div className="popup-comments">
                          <h4>
                            Comments ({(comments[pin.id] || []).length})
                          </h4>
                          {(comments[pin.id] || []).length > 0 ? (
                            <ul className="comments-list">
                              {(comments[pin.id] || []).map((comment, i) => (
                                <li key={comment.id || i} className="comment-item">
                                  <div className="comment-header">
                                    <span className="comment-author">
                                      {comment.author || "Anonymous"}
                                    </span>
                                    <span className="comment-time">
                                      {comment.timestamp || "Unknown time"}
                                    </span>
                                  </div>
                                  <div className="comment-text">
                                    {comment.text || comment}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="no-comments">No comments yet</p>
                          )}

                          <div className="add-comment">
                            <input
                              type="text"
                              placeholder="Add a comment..."
                              value={userComment}
                              onChange={(e) => setUserComment(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleAddComment(pin.id);
                              }}
                            />
                            <button onClick={() => handleAddComment(pin.id)}>
                              💬
                            </button>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {route && (
                  <Polyline
                    positions={route}
                    color="#4a69dd"
                    weight={5}
                    opacity={0.7}
                  />
                )}
              </MapContainer>

              <div className="map-legend">
                <h3>Map Legend</h3>
                <div className="legend-items">
                  {Object.entries(categoryIcons).map(([cat]) => (
                    <div key={cat} className="legend-item">
                      <span
                        className="legend-icon"
                        style={{ backgroundColor: categoryColors[cat] }}
                      >
                        {categoryIcons[cat].options.html.match(/\p{Emoji}/u)[0]}
                      </span>
                      <span className="legend-label">{cat}</span>
                    </div>
                  ))}
                  <div className="legend-item">
                    <span className="legend-icon user-location">
                      <div className="user-dot"></div>
                    </span>
                    <span className="legend-label">Your Location</span>
                  </div>
                </div>
              </div>

              <DistanceInfo
                distance={distance}
                isVisible={showDistanceInfo && distance}
                onClose={() => setShowDistanceInfo(false)}
              />
            </div>
          ) : (
            <div className="list-view">
              <h2>Community Needs List</h2>
              {sortedPins.length > 0 ? (
                <div className="pins-list">
                  {sortedPins.map((pin) => (
                    <div
                      key={pin.id}
                      className="pin-card"
                      style={{
                        borderLeft: `4px solid ${categoryColors[pin.category]}`,
                      }}
                    >
                      <div className="pin-card-header">
                        <div className="pin-card-title">
                          <span
                            className="pin-icon"
                            style={{
                              backgroundColor: categoryColors[pin.category],
                            }}
                          >
                            {
                              categoryIcons[pin.category].options.html.match(
                                /\p{Emoji}/u
                              )[0]
                            }
                          </span>
                          <h3>{pin.description}</h3>
                        </div>
                        <div className="pin-card-actions">
                          <button
                            className="upvote-btn"
                            onClick={() => handleUpvote(pin.id)}
                            style={{
                              opacity: upvotedByMe.has(pin.id) ? 0.6 : 1,
                              cursor: upvotedByMe.has(pin.id)
                                ? "not-allowed"
                                : "pointer",
                            }}
                            title={
                              upvotedByMe.has(pin.id)
                                ? "Already upvoted"
                                : "Upvote"
                            }
                          >
                            👍 {upvotes[pin.id] || 0}
                          </button>
                          <button
                            className="center-btn"
                            onClick={() => {
                              setMapCenter([
                                pin.position.lat,
                                pin.position.lng,
                              ]);
                              setViewMode("map");
                            }}
                          >
                            🎯
                          </button>
                          {pin.user_id === userId && (
                            <button
                              className="delete-btn"
                              onClick={() => handleDeletePin(pin.id)}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="pin-card-meta">
                        <span className="pin-category">{pin.category}</span>
                        <span className="pin-location">
                          {pin.position?.lat != null &&
                          pin.position?.lng != null
                            ? `Lat: ${Number(pin.position.lat).toFixed(5)}, Lng: ${Number(pin.position.lng).toFixed(5)}`
                            : "Location not available"}
                        </span>
                        <span className="pin-added">
                          Added: {pin.timestamp}
                        </span>
                      </div>

                      <div className="pin-card-comments">
                        <h4>
                          Comments ({(comments[pin.id] || []).length})
                          <button
                            className="toggle-comments-btn"
                            onClick={(e) => {
                              e.currentTarget
                                .closest(".pin-card")
                                .querySelector(".comments-container")
                                .classList.toggle("expanded");
                            }}
                          >
                            ▼
                          </button>
                        </h4>

                        <div className="comments-container">
                          {(comments[pin.id] || []).length > 0 ? (
                            <ul className="comments-list">
                              {(comments[pin.id] || []).map((comment, i) => (
                                <li
                                  key={comment.id || i}
                                  className="comment-item"
                                >
                                  <div className="comment-header">
                                    <span className="comment-author">
                                      {comment.author || "Anonymous"}
                                    </span>
                                    <span className="comment-time">
                                      {comment.timestamp || "Unknown time"}
                                    </span>
                                  </div>
                                  <div className="comment-text">
                                    {comment.text || comment}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="no-comments">No comments yet</p>
                          )}

                          <div className="add-comment">
                            <input
                              type="text"
                              placeholder="Add a comment..."
                              value={userComment}
                              onChange={(e) => setUserComment(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleAddComment(pin.id);
                              }}
                            />
                            <button onClick={() => handleAddComment(pin.id)}>
                              💬
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📍</div>
                  <h3>No pins found</h3>
                  <p>
                    {activeFilters.length > 0
                      ? "Try changing your filter settings or add new pins."
                      : "Click on the map to add your first pin!"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
