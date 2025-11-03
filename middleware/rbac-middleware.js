// RBAC Middleware for Pink Dreams Store
const jwt = require('jsonwebtoken');

// JWT Secret (should be in .env in production)
const JWT_SECRET = process.env.JWT_SECRET || 'pink-dreams-secret-key-2024';

// Middleware to verify admin/staff token
const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.headers['x-auth-token'];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired token.' 
    });
  }
};

// Middleware to check if user has required permission
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Super admin has all permissions
      if (userRole === 'super_admin') {
        return next();
      }

      // Get user's permissions from database
      const db = req.app.locals.db;
      
      // Get user with their role and permissions
      const user = await new Promise((resolve, reject) => {
        db.get(`
          SELECT u.*, r.permissions 
          FROM staff_users u
          LEFT JOIN staff_roles r ON u.role_id = r.id
          WHERE u.id = ?
        `, [userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found.' 
        });
      }

      // Parse permissions (stored as JSON string)
      let userPermissions = [];
      try {
        userPermissions = user.permissions ? JSON.parse(user.permissions) : [];
      } catch (e) {
        userPermissions = [];
      }

      // Check if user has the required permission
      if (!userPermissions.includes(requiredPermission)) {
        return res.status(403).json({ 
          success: false, 
          message: `Access denied. Required permission: ${requiredPermission}` 
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking permissions.' 
      });
    }
  };
};

// Middleware to check if user has any of the required permissions
const checkAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Super admin has all permissions
      if (userRole === 'super_admin') {
        return next();
      }

      // Get user's permissions from database
      const db = req.app.locals.db;
      
      const user = await new Promise((resolve, reject) => {
        db.get(`
          SELECT u.*, r.permissions 
          FROM staff_users u
          LEFT JOIN staff_roles r ON u.role_id = r.id
          WHERE u.id = ?
        `, [userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found.' 
        });
      }

      // Parse permissions
      let userPermissions = [];
      try {
        userPermissions = user.permissions ? JSON.parse(user.permissions) : [];
      } catch (e) {
        userPermissions = [];
      }

      // Check if user has any of the required permissions
      const hasPermission = permissions.some(perm => userPermissions.includes(perm));
      
      if (!hasPermission) {
        return res.status(403).json({ 
          success: false, 
          message: `Access denied. Required one of: ${permissions.join(', ')}` 
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking permissions.' 
      });
    }
  };
};

// Middleware to check if user has a specific role
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Insufficient role privileges.' 
      });
    }
    
    next();
  };
};

module.exports = {
  verifyToken,
  checkPermission,
  checkAnyPermission,
  checkRole,
  JWT_SECRET
};