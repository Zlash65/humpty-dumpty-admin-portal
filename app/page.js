'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress
} from '@mui/material';
import {
  Person as PersonIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  School as SchoolIcon
} from '@mui/icons-material';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push('/dashboard');
      } else {
        const data = await res.json();
        setError(data.message || 'Login failed');
        setLoading(false);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        bgcolor: '#f8fafc',
      }}
    >
      {/* Left Panel - Branding */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          width: '45%',
          bgcolor: '#1e293b',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 6,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle pattern overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: 0.03,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <Box sx={{ position: 'relative', textAlign: 'center', maxWidth: 400 }}>
          {/* Logo */}
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: 3,
              bgcolor: '#4f46e5',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 4,
              boxShadow: '0 8px 32px rgba(79, 70, 229, 0.3)',
            }}
          >
            <SchoolIcon sx={{ fontSize: 44, color: 'white' }} />
          </Box>

          <Typography
            variant="h3"
            sx={{
              fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
              fontWeight: 700,
              color: 'white',
              mb: 2,
            }}
          >
            Humpty Dumpty
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: '#94a3b8',
              fontWeight: 500,
              mb: 4,
            }}
          >
            School Administration Portal
          </Typography>

          <Box
            sx={{
              display: 'flex',
              gap: 2,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {['Manage Students', 'Track Fees', 'Staff Records'].map((item) => (
              <Box
                key={item}
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <Typography variant="body2" sx={{ color: '#cbd5e1', fontWeight: 500 }}>
                  {item}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Footer */}
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            bottom: 24,
            color: '#475569',
          }}
        >
          Where Learning Meets Excellence
        </Typography>
      </Box>

      {/* Right Panel - Login Form */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 4,
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          {/* Mobile Logo */}
          <Box
            sx={{
              display: { xs: 'flex', md: 'none' },
              flexDirection: 'column',
              alignItems: 'center',
              mb: 4,
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                bgcolor: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <SchoolIcon sx={{ fontSize: 32, color: 'white' }} />
            </Box>
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                fontWeight: 700,
                color: '#1e293b',
              }}
            >
              Humpty Dumpty
            </Typography>
          </Box>

          {/* Welcome Text */}
          <Box sx={{ mb: 4 }}>
            <Typography
              variant="h4"
              sx={{
                fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                fontWeight: 700,
                color: '#1e293b',
                mb: 1,
              }}
            >
              Welcome back
            </Typography>
            <Typography variant="body1" sx={{ color: '#64748b' }}>
              Sign in to your admin account
            </Typography>
          </Box>

          {/* Login Form */}
          <form onSubmit={handleSubmit}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155', mb: 1 }}>
                Username
              </Typography>
              <TextField
                fullWidth
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon sx={{ color: '#94a3b8', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155', mb: 1 }}>
                Password
              </Typography>
              <TextField
                fullWidth
                placeholder="Enter your password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: '#94a3b8', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff sx={{ fontSize: 20 }} /> : <Visibility sx={{ fontSize: 20 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                py: 1.5,
                bgcolor: '#4f46e5',
                '&:hover': {
                  bgcolor: '#4338ca',
                },
                '&:disabled': {
                  bgcolor: '#c7d2fe',
                }
              }}
            >
              {loading ? (
                <CircularProgress size={24} sx={{ color: 'white' }} />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Footer */}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              mt: 4,
              color: '#94a3b8',
            }}
          >
            Secure login for authorized administrators only
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
