import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './index.css'
import Welcome from './pages/Welcome'
import About from './pages/About'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import Dashboard from './pages/Dashboard'
import Children from './pages/Children'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/children" element={<Children />} />
      </Routes>
    </Router>
  )
}

export default App
