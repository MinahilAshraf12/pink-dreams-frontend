// RBAC Routes for Pink Dreams Store
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { verifyToken, checkPermission, checkRole, JWT_SECRET } = require('../middleware/rbac-middleware');

// All available permissions in the system
const ALL_PERMISSIONS = [
  // Product Management
  'products.view',
  'products.create',
  'products.edit',
  'products.delete',
  
  // Order Management
  'orders.view',
  'orders.edit',
  'orders.delete',
  
  // Category Management
  'categories.view',
  'categories.create',
  'categories.edit',
  'categories.delete',
  
  // Promo Code Management
  'promocodes.view',
  'promocodes.create',
  'promocodes.edit',
  'promocodes.delete',
  
  // Contact/Message Management
  'contacts.view',
  'contacts.delete',
  
  // Staff Management (admin only)
  'staff.view',
  'staff.create',
  'staff.edit',
  'staff.delete',
  
  // Role Management (admin only)
  'roles.view',
  'roles.create',
  'roles.edit',
  'roles.delete',
  
  // Analytics & Reports
  'analytics.view',
  'reports.view',
  
  // System Settings
  'settings.view',
  'settings.edit'
];

// Initialize RBAC tables
const initRBACTables = (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Staff Roles Table
      db.run(`
        CREATE TABLE IF NOT EXISTS staff_roles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          description TEXT,
          permissions TEXT DEFAULT '[]',
          is_system_role INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('Error creating staff_roles table:', err);
      });

      // Staff Users Table
      db.run(`
        CREATE TABLE IF NOT EXISTS staff_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role_id INTEGER,
          is_active INTEGER DEFAULT 1,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (role_id) REFERENCES staff_roles(id)
        )
      `, (err) => {
        if (err) console.error('Error creating staff_users table:', err);
      });

      // Activity Logs Table
      db.run(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          action TEXT NOT NULL,
          resource TEXT,
          resource_id INTEGER,
          details TEXT,
          ip_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES staff_users(id)
        )
      `, (err) => {
        if (err) console.error('Error creating activity_logs table:', err);
        else resolve();
      });
    });
  });
};

// Seed default roles
const seedDefaultRoles = async (db) => {
  const defaultRoles = [
    {
      name: 'super_admin',
      display_name: 'Super Administrator',
      description: 'Full system access with all permissions',
      permissions: JSON.stringify(ALL_PERMISSIONS),
      is_system_role: 1
    },
    {
      name: 'admin',
      display_name: 'Administrator',
      description: 'Administrative access with most permissions',
      permissions: JSON.stringify(ALL_PERMISSIONS.filter(p => !p.startsWith('staff.') && !p.startsWith('roles.'))),
      is_system_role: 1
    },
    {
      name: 'manager',
      display_name: 'Store Manager',
      description: 'Manage products, orders, and categories',
      permissions: JSON.stringify([
        'products.view', 'products.create', 'products.edit', 'products.delete',
        'orders.view', 'orders.edit',
        'categories.view', 'categories.create', 'categories.edit',
        'promocodes.view', 'promocodes.create', 'promocodes.edit',
        'contacts.view',
        'analytics.view', 'reports.view'
      ]),
      is_system_role: 1
    },
    {
      name: 'staff',
      display_name: 'Staff Member',
      description: 'Basic staff access for viewing and basic operations',
      permissions: JSON.stringify([
        'products.view',
        'orders.view', 'orders.edit',
        'categories.view',
        'promocodes.view',
        'contacts.view'
      ]),
      is_system_role: 1
    },
    {
      name: 'viewer',
      display_name: 'Viewer',
      description: 'Read-only access to view data',
      permissions: JSON.stringify([
        'products.view',
        'orders.view',
        'categories.view',
        'promocodes.view',
        'contacts.view',
        'analytics.view'
      ]),
      is_system_role: 1
    }
  ];

  for (const role of defaultRoles) {
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT OR IGNORE INTO staff_roles (name, display_name, description, permissions, is_system_role)
        VALUES (?, ?, ?, ?, ?)
      `, [role.name, role.display_name, role.description, role.permissions, role.is_system_role],
      (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// Create default super admin
const createDefaultSuperAdmin = async (db) => {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM staff_roles WHERE name = ?', ['super_admin'], (err, role) => {
      if (err) {
        reject(err);
        return;
      }
      
      db.run(`
        INSERT OR IGNORE INTO staff_users (username, email, password, full_name, role_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['admin', 'admin@pinkdreams.com', hashedPassword, 'Super Administrator', role.id, 1],
      (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Staff Login
router.post('/staff/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = req.app.locals.db;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required.' 
      });
    }

    // Get user with role information
    db.get(`
      SELECT u.*, r.name as role_name, r.display_name as role_display, r.permissions
      FROM staff_users u
      LEFT JOIN staff_roles r ON u.role_id = r.id
      WHERE u.username = ? AND u.is_active = 1
    `, [username], async (err, user) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: 'Database error.' 
        });
      }

      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials or inactive account.' 
        });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials.' 
        });
      }

      // Update last login
      db.run('UPDATE staff_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

      // Parse permissions
      let permissions = [];
      try {
        permissions = user.permissions ? JSON.parse(user.permissions) : [];
      } catch (e) {
        permissions = [];
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          username: user.username,
          role: user.role_name,
          roleId: user.role_id
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Log activity
      db.run(`
        INSERT INTO activity_logs (user_id, action, details)
        VALUES (?, ?, ?)
      `, [user.id, 'login', 'Staff member logged in']);

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          role: user.role_name,
          roleDisplay: user.role_display,
          permissions
        }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login.' 
    });
  }
});

// Get current user info
router.get('/staff/me', verifyToken, (req, res) => {
  const db = req.app.locals.db;
  
  db.get(`
    SELECT u.id, u.username, u.email, u.full_name, u.last_login,
           r.name as role_name, r.display_name as role_display, r.permissions
    FROM staff_users u
    LEFT JOIN staff_roles r ON u.role_id = r.id
    WHERE u.id = ?
  `, [req.user.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    let permissions = [];
    try {
      permissions = user.permissions ? JSON.parse(user.permissions) : [];
    } catch (e) {
      permissions = [];
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role_name,
        roleDisplay: user.role_display,
        lastLogin: user.last_login,
        permissions
      }
    });
  });
});

// ============================================
// ROLES MANAGEMENT ROUTES
// ============================================

// Get all roles
router.get('/roles', verifyToken, checkPermission('roles.view'), (req, res) => {
  const db = req.app.locals.db;
  
  db.all('SELECT * FROM staff_roles ORDER BY is_system_role DESC, name ASC', (err, roles) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching roles.' 
      });
    }

    const rolesWithPermissions = roles.map(role => ({
      ...role,
      permissions: JSON.parse(role.permissions || '[]')
    }));

    res.json({
      success: true,
      roles: rolesWithPermissions
    });
  });
});

// Get single role
router.get('/roles/:id', verifyToken, checkPermission('roles.view'), (req, res) => {
  const db = req.app.locals.db;
  
  db.get('SELECT * FROM staff_roles WHERE id = ?', [req.params.id], (err, role) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching role.' 
      });
    }

    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found.' 
      });
    }

    res.json({
      success: true,
      role: {
        ...role,
        permissions: JSON.parse(role.permissions || '[]')
      }
    });
  });
});

// Create new role
router.post('/roles', verifyToken, checkPermission('roles.create'), (req, res) => {
  const { name, display_name, description, permissions } = req.body;
  const db = req.app.locals.db;

  if (!name || !display_name) {
    return res.status(400).json({ 
      success: false, 
      message: 'Name and display name are required.' 
    });
  }

  const permissionsJson = JSON.stringify(permissions || []);

  db.run(`
    INSERT INTO staff_roles (name, display_name, description, permissions)
    VALUES (?, ?, ?, ?)
  `, [name, display_name, description, permissionsJson], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ 
          success: false, 
          message: 'Role name already exists.' 
        });
      }
      return res.status(500).json({ 
        success: false, 
        message: 'Error creating role.' 
      });
    }

    // Log activity
    db.run(`
      INSERT INTO activity_logs (user_id, action, resource, resource_id, details)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.userId, 'create', 'role', this.lastID, `Created role: ${name}`]);

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      roleId: this.lastID
    });
  });
});

// Update role
router.put('/roles/:id', verifyToken, checkPermission('roles.edit'), (req, res) => {
  const { display_name, description, permissions } = req.body;
  const db = req.app.locals.db;

  // Check if it's a system role
  db.get('SELECT is_system_role FROM staff_roles WHERE id = ?', [req.params.id], (err, role) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking role.' 
      });
    }

    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found.' 
      });
    }

    const permissionsJson = JSON.stringify(permissions || []);

    db.run(`
      UPDATE staff_roles 
      SET display_name = ?, description = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [display_name, description, permissionsJson, req.params.id], (err) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: 'Error updating role.' 
        });
      }

      // Log activity
      db.run(`
        INSERT INTO activity_logs (user_id, action, resource, resource_id, details)
        VALUES (?, ?, ?, ?, ?)
      `, [req.user.userId, 'update', 'role', req.params.id, 'Updated role']);

      res.json({
        success: true,
        message: 'Role updated successfully'
      });
    });
  });
});

// Delete role
router.delete('/roles/:id', verifyToken, checkPermission('roles.delete'), (req, res) => {
  const db = req.app.locals.db;

  // Check if it's a system role
  db.get('SELECT is_system_role, name FROM staff_roles WHERE id = ?', [req.params.id], (err, role) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking role.' 
      });
    }

    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found.' 
      });
    }

    if (role.is_system_role) {
      return res.status(403).json({ 
        success: false, 
        message: 'Cannot delete system roles.' 
      });
    }

    // Check if any users have this role
    db.get('SELECT COUNT(*) as count FROM staff_users WHERE role_id = ?', [req.params.id], (err, result) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: 'Error checking role usage.' 
        });
      }

      if (result.count > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete role. Users are assigned to this role.' 
        });
      }

      db.run('DELETE FROM staff_roles WHERE id = ?', [req.params.id], (err) => {
        if (err) {
          return res.status(500).json({ 
            success: false, 
            message: 'Error deleting role.' 
          });
        }

        // Log activity
        db.run(`
          INSERT INTO activity_logs (user_id, action, resource, resource_id, details)
          VALUES (?, ?, ?, ?, ?)
        `, [req.user.userId, 'delete', 'role', req.params.id, `Deleted role: ${role.name}`]);

        res.json({
          success: true,
          message: 'Role deleted successfully'
        });
      });
    });
  });
});

// ============================================
// STAFF USERS MANAGEMENT ROUTES
// ============================================

// Get all staff users
router.get('/staff', verifyToken, checkPermission('staff.view'), (req, res) => {
  const db = req.app.locals.db;
  
  db.all(`
    SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.last_login, u.created_at,
           r.name as role_name, r.display_name as role_display
    FROM staff_users u
    LEFT JOIN staff_roles r ON u.role_id = r.id
    ORDER BY u.created_at DESC
  `, (err, users) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching staff users.' 
      });
    }

    res.json({
      success: true,
      users
    });
  });
});

// Get single staff user
router.get('/staff/:id', verifyToken, checkPermission('staff.view'), (req, res) => {
  const db = req.app.locals.db;
  
  db.get(`
    SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.last_login, u.created_at, u.role_id,
           r.name as role_name, r.display_name as role_display, r.permissions
    FROM staff_users u
    LEFT JOIN staff_roles r ON u.role_id = r.id
    WHERE u.id = ?
  `, [req.params.id], (err, user) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching user.' 
      });
    }

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    res.json({
      success: true,
      user: {
        ...user,
        permissions: JSON.parse(user.permissions || '[]')
      }
    });
  });
});

// Create new staff user
router.post('/staff', verifyToken, checkPermission('staff.create'), async (req, res) => {
  try {
    const { username, email, password, full_name, role_id } = req.body;
    const db = req.app.locals.db;

    if (!username || !email || !password || !full_name || !role_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required.' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(`
      INSERT INTO staff_users (username, email, password, full_name, role_id)
      VALUES (?, ?, ?, ?, ?)
    `, [username, email, hashedPassword, full_name, role_id], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ 
            success: false, 
            message: 'Username or email already exists.' 
          });
        }
        return res.status(500).json({ 
          success: false, 
          message: 'Error creating user.' 
        });
      }

      // Log activity
      db.run(`
        INSERT INTO activity_logs (user_id, action, resource, resource_id, details)
        VALUES (?, ?, ?, ?, ?)
      `, [req.user.userId, 'create', 'staff_user', this.lastID, `Created user: ${username}`]);

      res.status(201).json({
        success: true,
        message: 'Staff user created successfully',
        userId: this.lastID
      });
    });
  } catch (error) {
    console.error('Error creating staff user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error.' 
    });
  }
});

// Update staff user
router.put('/staff/:id', verifyToken, checkPermission('staff.edit'), async (req, res) => {
  try {
    const { email, full_name, role_id, is_active, password } = req.body;
    const db = req.app.locals.db;

    let query = `
      UPDATE staff_users 
      SET email = ?, full_name = ?, role_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    `;
    let params = [email, full_name, role_id, is_active ? 1 : 0];

    // If password is provided, update it
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += `, password = ?`;
      params.push(hashedPassword);
    }

    query += ` WHERE id = ?`;
    params.push(req.params.id);

    db.run(query, params, (err) => {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ 
            success: false, 
            message: 'Email already exists.' 
          });
        }
        return res.status(500).json({ 
          success: false, 
          message: 'Error updating user.' 
        });
      }

      // Log activity
      db.run(`
        INSERT INTO activity_logs (user_id, action, resource, resource_id, details)
        VALUES (?, ?, ?, ?, ?)
      `, [req.user.userId, 'update', 'staff_user', req.params.id, 'Updated staff user']);

      res.json({
        success: true,
        message: 'Staff user updated successfully'
      });
    });
  } catch (error) {
    console.error('Error updating staff user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error.' 
    });
  }
});

// Delete staff user
router.delete('/staff/:id', verifyToken, checkPermission('staff.delete'), (req, res) => {
  const db = req.app.locals.db;

  // Prevent deleting yourself
  if (parseInt(req.params.id) === req.user.userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Cannot delete your own account.' 
    });
  }

  db.get('SELECT username FROM staff_users WHERE id = ?', [req.params.id], (err, user) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking user.' 
      });
    }

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    db.run('DELETE FROM staff_users WHERE id = ?', [req.params.id], (err) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: 'Error deleting user.' 
        });
      }

      // Log activity
      db.run(`
        INSERT INTO activity_logs (user_id, action, resource, resource_id, details)
        VALUES (?, ?, ?, ?, ?)
      `, [req.user.userId, 'delete', 'staff_user', req.params.id, `Deleted user: ${user.username}`]);

      res.json({
        success: true,
        message: 'Staff user deleted successfully'
      });
    });
  });
});

// ============================================
// PERMISSIONS ROUTES
// ============================================

// Get all available permissions
router.get('/permissions', verifyToken, (req, res) => {
  const permissionsByCategory = {
    'Product Management': ALL_PERMISSIONS.filter(p => p.startsWith('products.')),
    'Order Management': ALL_PERMISSIONS.filter(p => p.startsWith('orders.')),
    'Category Management': ALL_PERMISSIONS.filter(p => p.startsWith('categories.')),
    'Promo Code Management': ALL_PERMISSIONS.filter(p => p.startsWith('promocodes.')),
    'Contact Management': ALL_PERMISSIONS.filter(p => p.startsWith('contacts.')),
    'Staff Management': ALL_PERMISSIONS.filter(p => p.startsWith('staff.')),
    'Role Management': ALL_PERMISSIONS.filter(p => p.startsWith('roles.')),
    'Analytics & Reports': ALL_PERMISSIONS.filter(p => p.startsWith('analytics.') || p.startsWith('reports.')),
    'System Settings': ALL_PERMISSIONS.filter(p => p.startsWith('settings.'))
  };

  res.json({
    success: true,
    permissions: ALL_PERMISSIONS,
    permissionsByCategory
  });
});

// ============================================
// ACTIVITY LOGS ROUTES
// ============================================

// Get activity logs
router.get('/activity-logs', verifyToken, checkPermission('staff.view'), (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const db = req.app.locals.db;

  db.all(`
    SELECT a.*, u.username, u.full_name
    FROM activity_logs a
    LEFT JOIN staff_users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `, [parseInt(limit), parseInt(offset)], (err, logs) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching activity logs.' 
      });
    }

    res.json({
      success: true,
      logs
    });
  });
});

module.exports = {
  router,
  initRBACTables,
  seedDefaultRoles,
  createDefaultSuperAdmin,
  ALL_PERMISSIONS
};