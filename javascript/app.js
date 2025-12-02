new Vue({
    el: '#app',
    data: function () {
        return {
            // 用户认证状态
            isLoggedIn: false,
            currentUser: '',
            currentUserEmail: '',
            currentAuthForm: 'login', // login, register, reset, admin
            authLoading: false,

            // 管理员相关
            isAdmin: false,
            adminForm: {
                secretKey: ''
            },
            adminErrors: {
                secretKey: false
            },
            adminUsers: [],
            adminLoading: false,
            adminSearchTerm: '',
            adminFilter: 'all',
            currentPage: 1,
            itemsPerPage: 10,

            // 用户编辑模态框
            showEditModal: false,
            editForm: {
                id: null,
                username: '',
                email: '',
                usage_count: 0,
                last_used: ''
            },
            
            // 批量操作
            selectedUsers: [],

            // 登录表单数据
            loginForm: {
                username: '',
                password: '',
                remember: false
            },
            showLoginPassword: false,
            loginSuccess: false,
            loginErrors: {
                username: false,
                password: false
            },

            // 注册表单数据
            registerForm: {
                username: '',
                email: '',
                password: '',
                confirmPassword: ''
            },
            showRegisterPassword: false,
            showConfirmPassword: false,
            registerSuccess: false,
            registerErrors: {
                username: false,
                email: false,
                password: false,
                confirmPassword: false
            },
            passwordStrength: '', // weak, medium, strong
            passwordSuggestions: [], // 密码改进建议

            // 重置密码表单数据
            resetForm: {
                email: ''
            },
            resetSuccess: false,
            resetErrors: {
                email: false
            },

            // 主应用状态
            activeTab: 'home', // home, recognition, settings, admin

            // 图片处理相关
            uploadedImage: null,
            matchedImages: [],
            processingImage: false,
            matchedImage: null,
            matchedInfo: null,

            // 用户数据
            usageCount: 0,
            lastUsed: null,
            registrationDate: null,
            settings: {
                notifications: true,
                autoSave: true
            }
        };
    },
    computed: {
        // 密码强度样式类
        passwordStrengthClass: function () {
            return this.passwordStrength ? 'password-strength ' + this.passwordStrength : 'password-strength';
        },

        // 密码强度文字
        getPasswordStrengthText: function () {
            switch (this.passwordStrength) {
                case 'weak':
                    return '弱';
                case 'medium':
                    return '中';
                case 'strong':
                    return '强';
                default:
                    return '';
            }
        },

        // 密码强度图标
        getPasswordStrengthIcon: function () {
            switch (this.passwordStrength) {
                case 'weak':
                    return 'fas fa-exclamation-triangle';
                case 'medium':
                    return 'fas fa-check-circle';
                case 'strong':
                    return 'fas fa-shield-alt';
                default:
                    return 'fas fa-circle';
            }
        },

        // 密码建议文本
        getPasswordSuggestionsText: function () {
            if (this.passwordSuggestions.length === 0) return '';
            return '建议：' + this.passwordSuggestions.join('、');
        },

        // 格式化最后使用时间显示 - 主页使用
        formattedLastUsed: function () {
            if (!this.lastUsed) {
                return '从未使用';
            }
            try {
                var date = new Date(this.lastUsed);
                if (isNaN(date.getTime())) {
                    return '从未使用';
                }

                var now = new Date();
                var diffInMs = now - date;
                var diffInMinutes = Math.floor(diffInMs / (1000 * 60));
                var diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
                var diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

                if (diffInMinutes < 1) {
                    return '刚刚';
                } else if (diffInMinutes < 60) {
                    return diffInMinutes + '分钟前';
                } else if (diffInHours < 24) {
                    return diffInHours + '小时前';
                } else if (diffInDays < 7) {
                    return diffInDays + '天前';
                } else {
                    return date.toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    });
                }
            } catch (error) {
                console.error('时间格式化错误:', error);
                return '从未使用';
            }
        },

        // 格式化注册时间显示 - 设置页面使用
        formattedRegistrationDate: function () {
            if (!this.registrationDate) {
                return '未知';
            }
            try {
                var date = new Date(this.registrationDate);
                if (isNaN(date.getTime())) {
                    return '未知';
                }

                return date.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
            } catch (error) {
                console.error('注册时间格式化错误:', error);
                return '未知';
            }
        },

        // 格式化最后使用时间显示 - 设置页面使用
        formattedLastUsedForSettings: function () {
            if (!this.lastUsed) {
                return '从未使用';
            }
            try {
                var date = new Date(this.lastUsed);
                if (isNaN(date.getTime())) {
                    return '从未使用';
                }

                return date.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            } catch (error) {
                console.error('时间格式化错误:', error);
                return '从未使用';
            }
        },

        // 过滤用户列表
        filteredUsers: function () {
            if (!this.adminSearchTerm) {
                return this.adminUsers;
            }

            var searchTerm = this.adminSearchTerm.toLowerCase();
            return this.adminUsers.filter(function (user) {
                return user.username.toLowerCase().includes(searchTerm) ||
                    user.email.toLowerCase().includes(searchTerm);
            });
        },

        // 总识别次数
        totalUsageCount: function () {
            return this.adminUsers.reduce(function (total, user) {
                return total + (user.usage_count || 0);
            }, 0);
        },

        // 活跃用户数（最近30天有活动的）
        activeUsersCount: function () {
            var thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            return this.adminUsers.filter(function (user) {
                if (!user.last_used) return false;
                var lastUsed = new Date(user.last_used);
                return lastUsed > thirtyDaysAgo;
            }).length;
        },
        
        // 过滤和分页用户列表
        filteredAndPaginatedUsers: function () {
            let users = this.adminUsers;
            
            // 搜索过滤
            if (this.adminSearchTerm) {
                const searchTerm = this.adminSearchTerm.toLowerCase();
                users = users.filter(user => 
                    user.username.toLowerCase().includes(searchTerm) ||
                    user.email.toLowerCase().includes(searchTerm) ||
                    user.id.toString().includes(searchTerm)
                );
            }
            
            // 状态过滤
            switch (this.adminFilter) {
                case 'active':
                    users = users.filter(user => this.isActiveUser(user));
                    break;
                case 'inactive':
                    users = users.filter(user => !this.isActiveUser(user));
                    break;
                case 'today':
                    const today = new Date().toDateString();
                    users = users.filter(user => {
                        const regDate = new Date(user.registration_date).toDateString();
                        return regDate === today;
                    });
                    break;
            }
            
            // 分页
            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            return users.slice(startIndex, startIndex + this.itemsPerPage);
        },
        
        // 总页数
        totalPages: function () {
            return Math.ceil(this.adminUsers.length / this.itemsPerPage);
        },
        
        // 今日新增用户数
        newUsersTodayCount: function () {
            const today = new Date().toDateString();
            return this.adminUsers.filter(user => {
                const regDate = new Date(user.registration_date).toDateString();
                return regDate === today;
            }).length;
        }
    },
    methods: {
         // ========== 认证相关方法 ==========
         switchToLogin: function () {
            this.currentAuthForm = 'login';
        },

        hasDuplicateUsername: function () {
            return false;
        },



        /**
         * 用户登录
         */
        login: function () {
            var self = this;

            // 重置错误状态
            self.loginErrors = { username: false, password: false };

            // 基本验证
            var hasError = false;
            if (!self.loginForm.username.trim()) {
                self.loginErrors.username = true;
                hasError = true;
            }
            if (!self.loginForm.password) {
                self.loginErrors.password = true;
                hasError = true;
            }

            if (hasError) return;

            self.authLoading = true;

            fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: self.loginForm.username.trim(),
                    password: self.loginForm.password
                })
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        // 登录成功
                        self.loginSuccess = true;
                        self.isLoggedIn = true;
                        self.currentUser = data.user.username;
                        self.currentUserEmail = data.user.email;

                        // 更新用户数据
                        self.usageCount = data.user.usageCount || 0;
                        self.lastUsed = data.user.lastUsed;
                        self.registrationDate = data.user.registrationDate;
                        self.settings = data.user.settings || self.settings;

                        // 保存登录状态到本地存储
                        if (self.loginForm.remember) {
                            localStorage.setItem('currentUser', self.currentUser);
                            localStorage.setItem('currentUserEmail', self.currentUserEmail);
                        }

                        // 重置表单
                        setTimeout(function () {
                            self.loginSuccess = false;
                            self.resetLoginForm();
                        }, 2000);

                        console.log('登录成功:', self.currentUser);
                    } else {
                        alert(data.msg || '登录失败');
                    }
                })
                .catch(function (error) {
                    console.error('登录失败:', error);
                    alert('登录失败，请检查网络连接后重试');
                })
                .finally(function () {
                    self.authLoading = false;
                });
        },

        /**
         * 用户注册
         */
        register: function () {
            var self = this;

            // 重置错误状态
            self.registerErrors = { username: false, email: false, password: false, confirmPassword: false };

            // 表单验证
            if (!self.validateRegisterForm()) {
                return;
            }

            // 检查密码强度并给出提醒（但不阻止注册）
            if (self.passwordStrength === 'weak') {
                var suggestionText = self.passwordSuggestions.length > 0
                    ? '\n\n改进建议：' + self.passwordSuggestions.join('、')
                    : '';

                var userConfirmed = confirm(
                    '您的密码强度较弱，可能存在安全风险。' + suggestionText + '\n\n是否继续使用当前密码？'
                );
                if (!userConfirmed) {
                    return;
                }
            }

            self.authLoading = true;

            fetch('http://localhost:3000/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: self.registerForm.username.trim(),
                    email: self.registerForm.email.trim(),
                    password: self.registerForm.password
                })
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        self.registerSuccess = true;

                        // 显示成功信息后返回登录页
                        setTimeout(function () {
                            self.registerSuccess = false;
                            self.resetRegisterForm();
                            self.currentAuthForm = 'login';
                            alert('注册成功！请登录您的账户。');
                        }, 2000);

                        console.log('注册成功:', self.registerForm.username);
                    } else {
                        // 现在只有邮箱可能冲突
                        if (data.msg.includes('邮箱')) {
                            self.registerErrors.email = true;
                        }
                        alert(data.msg || '注册失败');
                    }
                })
                .catch(function (error) {
                    console.error('注册失败:', error);
                    alert('注册失败，请检查网络连接后重试');
                })
                .finally(function () {
                    self.authLoading = false;
                });
        },

        /**
         * 重置密码
         */
        resetPassword: function () {
            var self = this;

            // 重置错误状态
            self.resetErrors = { email: false };

            if (!self.resetForm.email.trim()) {
                self.resetErrors.email = true;
                alert('请输入邮箱地址');
                return;
            }

            // 简单的邮箱格式验证
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(self.resetForm.email.trim())) {
                self.resetErrors.email = true;
                alert('请输入有效的邮箱地址');
                return;
            }

            self.authLoading = true;

            fetch('http://localhost:3000/api/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: self.resetForm.email.trim()
                })
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        // 模拟发送重置邮件
                        self.resetSuccess = true;

                        // 重置表单并返回登录页
                        setTimeout(function () {
                            self.resetForm.email = '';
                            self.resetSuccess = false;
                            self.currentAuthForm = 'login';
                            alert('重置链接已发送到您的邮箱，请查收。');
                        }, 3000);
                    } else {
                        alert(data.msg || '发送失败');
                    }
                })
                .catch(function (error) {
                    console.error('发送失败:', error);
                    alert('发送失败，请检查网络连接后重试');
                })
                .finally(function () {
                    self.authLoading = false;
                });
        },

        /**
         * 管理员登录
         */
        adminLogin: function () 
        {
            var self = this;

            self.adminErrors = { secretKey: false };

            if (!self.adminForm.secretKey.trim()) {
                self.adminErrors.secretKey = true;
                alert('请输入管理员密钥');
                return;
            }

            self.authLoading = true;

            fetch('http://localhost:3000/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secretKey: self.adminForm.secretKey
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // 登录成功
                    self.isAdmin = true;
                    self.isLoggedIn = true;
                    self.currentUser = '管理员';
                    self.currentUserEmail = 'admin@system.com';
                    
                    // 清空输入框
                    self.adminForm.secretKey = '';
                    
                    // 显示管理员界面
                    self.activeTab = 'admin';
                    
                    // 立即加载用户数据
                    self.loadAdminUsers();
                } else {
                    alert(data.msg || '管理员密钥错误');
                }
            })
            .catch(err => {
                console.error('管理员登录错误:', err);
                alert('管理员登录失败，请检查后端服务');
            })
            .finally(() => {
                self.authLoading = false;
            });
        },

        /**
         * 从数据库加载用户列表
         */
        loadAdminUsers: function () {
            var self = this;

            self.adminLoading = true;
            
            console.log('🔄 正在加载用户数据...');

            fetch('http://localhost:3000/api/admin/users')
                .then(res => res.json())
                .then(data => {
                    console.log('✅ 后端返回的用户数据:', data); // 重要：查看实际数据结构
                    
                    if (data.success && data.users) {
                        // 统一处理字段名，适配各种可能的格式
                        self.adminUsers = data.users.map(user => {
                            // 转换所有可能的字段名格式为统一的小写格式
                            return {
                                id: user.id || user.ID || user.user_id || 0,
                                username: user.username || user.USERNAME || user.userName || '未知用户',
                                email: user.email || user.EMAIL || user.mail || '未知邮箱',
                                usage_count: user.usage_count || user.USAGE_COUNT || user.usageCount || user.count || 0,
                                registration_date: user.registration_date || user.REGISTRATION_DATE || 
                                                user.regDate || user.create_time || null,
                                last_used: user.last_used || user.LAST_USED || user.lastUsed || 
                                        user.last_login || user.update_time || null
                            };
                        });
                        
                        console.log('📊 处理后的用户数据:', self.adminUsers);
                        console.log('✅ 成功加载', self.adminUsers.length, '个用户');
                    } else {
                        console.error('❌ 加载用户失败:', data.msg);
                        alert('加载用户失败: ' + (data.msg || '未知错误'));
                    }
                })
                .catch(err => {
                    console.error('❌ 加载用户失败:', err);
                    alert('无法加载用户列表，请检查网络连接');
                })
                .finally(() => {
                    self.adminLoading = false;
                });
        },


        /**
         * 编辑用户信息
         */
        editUser: function (user) {
            this.editForm = {
                id: user.id,
                username: user.username,
                email: user.email,
                usage_count: user.usage_count || 0,
                last_used: user.last_used ? this.formatDateTimeForInput(user.last_used) : ''
            };
            this.showEditModal = true;
        },

        /**
         * 保存用户编辑
         */
        saveUserEdit: function () {
            var self = this;
            
            if (!self.editForm.username || !self.editForm.email) {
                alert('用户名和邮箱不能为空');
                return;
            }

            fetch(`http://localhost:3000/api/admin/users/${self.editForm.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(self.editForm)
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        alert('用户信息更新成功');
                        self.closeEditModal();
                        self.loadAdminUsers(); // 重新加载数据
                    } else {
                        alert('更新失败: ' + data.msg);
                    }
                })
                .catch(function (error) {
                    console.error('更新用户信息失败:', error);
                    alert('更新失败，请检查网络连接');
                });
        },

        /**
         * 关闭编辑模态框
         */
        closeEditModal: function () {
            this.showEditModal = false;
            this.editForm = {
                id: null,
                username: '',
                email: '',
                usage_count: 0,
                last_used: ''
            };
        },

        /**
         * 从数据库删除用户
         */
        deleteUser: function (userId, username) {
            var self = this;

            if (!confirm(`确定要删除用户 "${username}" 吗？此操作将从数据库中永久删除！`)) {
                return;
            }

            console.log(`🗑️ 正在删除用户: ${username} (ID: ${userId})`);

            fetch(`http://localhost:3000/api/admin/users/${userId}`, {
                method: 'DELETE'
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        console.log('✅ 用户删除成功');
                        alert('用户删除成功');
                        self.loadAdminUsers(); // 重新从数据库加载用户列表
                    } else {
                        alert(data.msg || '删除用户失败');
                        console.error('❌ 删除用户失败:', data.msg);
                    }
                })
                .catch(function (error) {
                    console.error('❌ 删除用户失败:', error);
                    alert('删除用户失败，请检查网络连接');
                });
        },

        /**
         * 重置用户密码
         */
        resetUserPassword: function (userId, username) {
            var self = this;

            var newPassword = prompt(`请输入用户 "${username}" 的新密码：`);

            if (!newPassword) {
                alert('密码不能为空');
                return;
            }

            if (newPassword.length < 6) {
                alert('密码至少需要6个字符');
                return;
            }

            console.log(`🔑 正在重置用户密码: ${username} (ID: ${userId})`);

            fetch(`http://localhost:3000/api/admin/users/${userId}/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    newPassword: newPassword
                })
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        console.log('✅ 密码重置成功');
                        alert('密码重置成功');
                    } else {
                        alert(data.msg || '密码重置失败');
                        console.error('❌ 密码重置失败:', data.msg);
                    }
                })
                .catch(function (error) {
                    console.error('❌ 密码重置失败:', error);
                    alert('密码重置失败');
                });
        },

        /**
         * 管理员退出
         */
        adminLogout: function () {
            this.isAdmin = false;
            this.isLoggedIn = false;
            this.currentUser = '';
            this.currentUserEmail = '';
            this.adminForm.secretKey = '';
            this.adminUsers = [];
            this.currentAuthForm = 'login';
            this.activeTab = 'home';
            console.log('管理员已退出');
        },

        /**
         * 用户退出登录
         */
        logout: function () {
            if (this.isAdmin) {
                this.adminLogout();
            } else {
                this.isLoggedIn = false;
                this.currentUser = '';
                this.currentUserEmail = '';
                localStorage.removeItem('currentUser');
                localStorage.removeItem('currentUserEmail');

                // 重置所有状态
                this.resetLoginForm();
                this.resetRegisterForm();
                this.resetImageData();
                this.currentAuthForm = 'login';
                this.activeTab = 'home';
            }
            console.log('用户已退出登录');
        },

        // ========== 表单验证方法 ==========

        /**
         * 验证注册表单
         */
        validateRegisterForm: function () {
            var username = this.registerForm.username;
            var email = this.registerForm.email;
            var password = this.registerForm.password;
            var confirmPassword = this.registerForm.confirmPassword;
            var isValid = true;

            // 用户名验证
            if (!username.trim()) {
                this.registerErrors.username = true;
                isValid = false;
            } else if (username.length < 3) {
                alert('用户名至少需要3个字符');
                isValid = false;
            }

            // 邮箱验证
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                this.registerErrors.email = true;
                isValid = false;
            }

            // 密码验证
            if (!password || password.length < 6) {
                this.registerErrors.password = true;
                isValid = false;
                if (password && password.length < 6) {
                    alert('密码至少需要6个字符');
                }
            }

            // 确认密码验证
            if (password !== confirmPassword) {
                this.registerErrors.confirmPassword = true;
                isValid = false;
            }

            return isValid;
        },

        /**
         * 检查密码强度并给出详细建议
         */
        checkPasswordStrength: function () {
            var password = this.registerForm.password;
            this.passwordSuggestions = [];

            if (password.length === 0) {
                this.passwordStrength = '';
                return;
            }

            var strength = 0;

            // 基础长度检查
            if (password.length >= 6) strength += 1;
            if (password.length >= 8) strength += 1;
            if (password.length >= 12) strength += 2;

            // 字符类型检查
            var hasLower = /[a-z]/.test(password);
            var hasUpper = /[A-Z]/.test(password);
            var hasDigit = /\d/.test(password);
            var hasSpecial = /[^a-zA-Z\d]/.test(password);

            if (hasLower) strength += 1;
            if (hasUpper) strength += 1;
            if (hasDigit) strength += 1;
            if (hasSpecial) strength += 2;

            // 生成改进建议
            if (!hasLower && password.length > 0) this.passwordSuggestions.push('添加小写字母');
            if (!hasUpper && password.length > 0) this.passwordSuggestions.push('添加大写字母');
            if (!hasDigit && password.length > 0) this.passwordSuggestions.push('添加数字');
            if (!hasSpecial && password.length > 0) this.passwordSuggestions.push('添加特殊字符');
            if (password.length < 8) this.passwordSuggestions.push('增加密码长度');

            // 确定强度等级
            if (strength <= 3) {
                this.passwordStrength = 'weak';
            } else if (strength <= 6) {
                this.passwordStrength = 'medium';
            } else {
                this.passwordStrength = 'strong';
            }

            // 更新错误状态
            this.registerErrors.password = !password || password.length < 6;
        },

        // ========== 图片处理相关方法 ==========

        /**
         * 触发文件选择
         */
        triggerFileInput: function () {
            this.$refs.fileInput.click();
        },

        /**
         * 处理文件选择
         */
        handleFileSelect: function (event) {
            var file = event.target.files[0];
            var self = this;

            if (file) {
                // 验证文件类型和大小
                if (!file.type.startsWith('image/')) {
                    alert('请选择图片文件');
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    alert('图片大小不能超过5MB');
                    return;
                }

                var reader = new FileReader();
                reader.onload = function (e) {
                    self.uploadedImage = e.target.result;
                    self.matchedImages = [];
                    console.log('图片上传成功');
                };
                reader.onerror = function () {
                    alert('图片读取失败，请重试');
                };
                reader.readAsDataURL(file);
            }
        },

        /**
         * 处理拖放文件
         */
        handleDrop: function (event) {
            event.preventDefault();
            var file = event.dataTransfer.files[0];
            var self = this;

            if (file && file.type.startsWith('image/')) {
                var reader = new FileReader();
                reader.onload = function (e) {
                    self.uploadedImage = e.target.result;
                    self.matchedImages = [];
                };
                reader.readAsDataURL(file);
            }
        },


        /**
         * 处理图片识别
         */
        processImage: function () {
            var self = this;

            if (!self.uploadedImage) {
                alert('请先上传图片');
                return;
            }

            self.processingImage = true;
            self.matchedImages = [];
            self.matchedImage = null;
            self.matchedInfo = null;

            // 将base64图片转换为blob
            fetch(self.uploadedImage)
                .then(function (response) {
                    return response.blob();
                })
                .then(function (blob) {
                    // 构建FormData发送到后端
                    var formData = new FormData();
                    formData.append('image', blob, 'query.jpg');
                    formData.append('email', self.currentUserEmail);

                    // 调用后端识别接口
                    return fetch('http://localhost:3000/api/reid', {
                        method: 'POST',
                        body: formData
                    });
                })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        // 显示匹配图片
                        self.matchedImage = 'http://localhost:3000' + data.match.imageUrl;

                        // 保存相似度与距离
                        self.matchedInfo = {
                            similarity: data.match.similarity,
                            distance: data.match.distance
                        };

                        // 更新使用统计
                        self.usageCount++;
                        self.lastUsed = new Date().toISOString();

                        console.log('图片识别完成，最相似结果:', self.matchedInfo);
                    } else {
                        alert(data.msg || '识别失败');
                    }
                })
                .catch(function (error) {
                    console.error('图片处理失败:', error);
                    alert('图片处理失败，请检查网络连接或后端服务后重试');
                })
                .finally(function () {
                    self.processingImage = false;
                });
        },

        /**
         * 清除图片
         */
        clearImages: function () {
            this.uploadedImage = null;
            this.matchedImages = [];
            if (this.$refs.fileInput) {
                this.$refs.fileInput.value = '';
            }
            console.log('图片已清除');
        },

        // ========== 工具方法 ==========

        /**
         * 重置图片数据
         */
        resetImageData: function () {
            this.uploadedImage = null;
            this.matchedImages = [];
            this.processingImage = false;
        },

        /**
         * 格式化日期显示
         */
        formatDate: function (dateString) {
            if (!dateString) return '从未登录';

            try {
                var date = new Date(dateString);
                if (isNaN(date.getTime())) {
                    return '无效日期';
                }

                return date.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            } catch (error) {
                console.error('日期格式化错误:', error);
                return '无效日期';
            }
        },

        /**
         * 重置登录表单
         */
        resetLoginForm: function () {
            this.loginForm = {
                username: '',
                password: '',
                remember: false
            };
            this.loginErrors = {
                username: false,
                password: false
            };
            this.showLoginPassword = false;
        },

        /**
         * 重置注册表单
         */
        resetRegisterForm: function () {
            this.registerForm = {
                username: '',
                email: '',
                password: '',
                confirmPassword: ''
            };
            this.registerErrors = {
                username: false,
                email: false,
                password: false,
                confirmPassword: false
            };
            this.showRegisterPassword = false;
            this.showConfirmPassword = false;
            this.passwordStrength = '';
            this.passwordSuggestions = [];
        },

        // ========== 管理员专用方法 ==========

        /**
         * 上一页
         */
        prevPage: function () {
            if (this.currentPage > 1) {
                this.currentPage--;
            }
        },

        /**
         * 下一页
         */
        nextPage: function () {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
            }
        },

        /**
         * 判断用户是否活跃（最近30天有活动）
         */
        isActiveUser: function (user) {
            if (!user.last_used) return false;
            try {
                var thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                var lastUsed = new Date(user.last_used);
                return lastUsed > thirtyDaysAgo;
            } catch (error) {
                console.error('判断用户活跃状态错误:', error);
                return false;
            }
        },

        /**
         * 获取用户状态
         */
        getUserStatus: function (user) {
            return this.isActiveUser(user) ? 'active' : 'inactive';
        },

        /**
         * 获取用户状态文本
         */
        getUserStatusText: function (user) {
            return this.isActiveUser(user) ? '活跃' : '非活跃';
        },

        /**
         * 获取状态图标
         */
        getStatusIcon: function (user) {
            return this.isActiveUser(user) ? 'fas fa-check-circle' : 'fas fa-clock';
        },

        /**
         * 获取使用级别样式
         */
        getUsageLevel: function (count) {
            if (!count || count === 0) return 'low';
            if (count <= 10) return 'medium';
            return 'high';
        },

        /**
         * 格式化最后使用时间显示
         */
        formatLastUsed: function (lastUsed) {
            if (!lastUsed) return '从未使用';
            try {
                var date = new Date(lastUsed);
                if (isNaN(date.getTime())) {
                    return '从未使用';
                }

                var now = new Date();
                var diffInMs = now - date;
                var diffInMinutes = Math.floor(diffInMs / (1000 * 60));
                var diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
                var diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

                if (diffInMinutes < 1) {
                    return '刚刚';
                } else if (diffInMinutes < 60) {
                    return diffInMinutes + '分钟前';
                } else if (diffInHours < 24) {
                    return diffInHours + '小时前';
                } else if (diffInDays < 7) {
                    return diffInDays + '天前';
                } else {
                    return date.toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    });
                }
            } catch (error) {
                console.error('时间格式化错误:', error);
                return '从未使用';
            }
        },

        /**
         * 格式化日期时间用于输入框
         */
        formatDateTimeForInput: function (dateString) {
            if (!dateString) return '';
            try {
                var date = new Date(dateString);
                if (isNaN(date.getTime())) {
                    return '';
                }
                return date.toISOString().slice(0, 16);
            } catch (error) {
                console.error('日期时间格式化错误:', error);
                return '';
            }
        },

        /**
         * 导出用户数据到CSV
         */
        exportUserData: function () {
            var self = this;

            if (self.adminUsers.length === 0) {
                alert('没有可导出的用户数据');
                return;
            }

            console.log("📊 正在生成专业版用户数据报表...");

            // 统计信息
            const totalUsers = self.adminUsers.length;
            const activeUsers = self.adminUsers.filter(u => (u.USAGE_COUNT || 0) > 0).length;
            const totalUsage = self.adminUsers.reduce((sum, u) => sum + (u.USAGE_COUNT || 0), 0);

            const regDates = self.adminUsers
                .map(u => u.REGISTRATION_DATE ? new Date(u.REGISTRATION_DATE) : null)
                .filter(d => d !== null)
                .sort((a, b) => a - b);

            const earliestReg = regDates.length ? regDates[0].toLocaleString() : "无记录";
            const latestReg   = regDates.length ? regDates[regDates.length - 1].toLocaleString() : "无记录";

            const mostUsed = self.adminUsers.reduce((a, b) =>
                (a.USAGE_COUNT || 0) > (b.USAGE_COUNT || 0) ? a : b
            );

            // 正确写法：只用 BOM，不写 data: 前缀
            var csv = "\uFEFF";

            csv += "########## 行人重识别系统 — 用户数据专业报表 ##########\n";
            csv += "生成时间：" + new Date().toLocaleString() + "\n";
            csv += "--------------------------------------------------------\n";
            csv += "【统计信息摘要】\n";
            csv += "用户总数：" + totalUsers + "\n";
            csv += "活跃用户数：" + activeUsers + "\n";
            csv += "累计识别次数：" + totalUsage + "\n";
            csv += "最早注册时间：" + earliestReg + "\n";
            csv += "最近注册时间：" + latestReg + "\n";
            csv += "使用次数最多的用户：" +
                    (mostUsed.USERNAME || "未知") +
                    "（" + (mostUsed.USAGE_COUNT || 0) + " 次）\n";
            csv += "########################################################\n\n";

            csv += "ID, 用户名, 邮箱, 使用次数, 注册时间, 最近使用, 状态\n";
            csv += "--------------------------------------------------------\n";

            self.adminUsers.forEach(function (user) {
                const status = self.getUserStatusText(user);

                const row = [
                    user.ID,
                    `"${user.USERNAME}"`,
                    `"${user.EMAIL}"`,
                    user.USAGE_COUNT || 0,
                    `"${self.formatDate(user.REGISTRATION_DATE)}"`,
                    `"${self.formatLastUsed(user.LAST_USED)}"`,
                    status
                ].join(", ");

                csv += row + "\n";
            });

            // 正确下载方式（不会丢内容）
            var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            var link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "用户专业报表.csv";
            link.click();

            console.log("✅ 用户专业报表导出成功");
        },




        /**
         * 批量重置密码（示例功能）
         */
        bulkResetPasswords: function () {
            alert('批量重置密码功能正在开发中...');
            console.log('🛠️ 批量重置密码功能开发中');
        },

        /**
         * 清理非活跃用户（示例功能）
         */
        clearInactiveUsers: function () {
            var inactiveUsers = this.adminUsers.filter(user => !this.isActiveUser(user));
            
            if (inactiveUsers.length === 0) {
                alert('没有找到非活跃用户');
                return;
            }
            
            if (confirm(`找到 ${inactiveUsers.length} 个非活跃用户（30天内无活动）。确定要删除吗？此操作不可撤销！`)) {
                console.log('🛠️ 清理非活跃用户功能开发中，找到的非活跃用户:', inactiveUsers);
                alert('清理非活跃用户功能正在开发中');
            }
        },

        /**
         * 切换到登录表单 - 修复缺失的方法
         */
        switchToLogin: function () {
            this.currentAuthForm = 'login';
            this.adminForm.secretKey = '';
        }
    },
    mounted: function () {
        // 应用初始化
        console.log('行人重识别系统初始化');

        // 检查登录状态
        var savedUser = localStorage.getItem('currentUser');
        var savedEmail = localStorage.getItem('currentUserEmail');

        if (savedUser && savedEmail) {
            this.isLoggedIn = true;
            this.currentUser = savedUser;
            this.currentUserEmail = savedEmail;
            console.log('自动登录用户:', savedUser);
        }

        // 设置默认标签页
        this.activeTab = 'home';
    },

    watch: {
        // 监听认证表单变化
        currentAuthForm: function(newVal, oldVal) {
            console.log('认证表单变化:', oldVal, '->', newVal);
        },
        
        // 监听活跃标签页变化
        activeTab: function(newTab, oldTab) {
            console.log('标签页变化:', oldTab, '->', newTab);
            
            // 当切换到管理员标签页且是管理员时，如果用户列表为空，自动加载数据
            if (newTab === 'admin' && this.isAdmin && this.adminUsers.length === 0) {
                console.log('🔄 切换到管理员界面，自动加载用户数据...');
                setTimeout(() => {
                    this.loadAdminUsers();
                }, 100);
            }
        },
        
        // 监听设置变化
        settings: {
            handler: function (newSettings) {
                var self = this;
                if (this.isLoggedIn && !this.isAdmin) {
                    fetch('http://localhost:3000/api/user/settings', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            email: self.currentUserEmail,
                            settings: newSettings
                        })
                    }).catch(function (error) {
                        console.error('保存设置失败:', error);
                    });
                }
            },
            deep: true
        }
    }
});