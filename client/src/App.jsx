import React from "react";
import { Route, Routes } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";

const App = () => {
  return (
    <div className="min-h-screen bg-slate-900 relative flex items-center justify-center p-4 overflow-hidden">
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
      </Routes>
      {/* Zustand is used to manage global state. */}
      {/* A store in zustand is a simple object that holds the application's state and provides methods to update it. */}
      {/* The store keeps the global state across the application. So there is no need to pass props down through multiple components. */}
      {/* Usually a state is a simple value or an object that represents the current status of the app. ex for state :- {value, setValue} this is a simple state. */}
    </div>
  );
};

export default App;
