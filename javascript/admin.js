(function () {
    var ADMIN_TOKEN_KEY = 'reid_admin_token';
    var DEFAULT_STATS = Object.freeze({
        totalUsers: 0,
        totalUsage: 0,
        activeUsers: 0,
        todayUsers: 0
    });

    function safeJson(response) {
        return response.json().catch(function () {
            return {};
        }).then(function (data) {
            return {
                ok: response.ok,
                status: response.status,
                data: data
            };
        });
    }

    new Vue({
        el: '#admin-app',
        data: function () {
            return {
                apiBase: window.location.origin || 'http://localhost:3000',
                isAuthenticated: false,
                authLoading: false,
                dashboardLoading: false,
                modalSaving: false,
                secretKey: '',
                loginError: '',
                adminToken: '',
                users: [],
                stats: Object.assign({}, DEFAULT_STATS),
                searchTerm: '',
                statusFilter: 'all',
                sortBy: 'recent',
                currentPage: 1,
                pageSize: 8,
                lastLoadedAt: '',
                showEditModal: false,
                editForm: {
                    id: null,
                    username: '',
                    email: '',
                    usage_count: 0,
                    last_used: ''
                },
                toast: {
                    visible: false,
                    type: 'info',
                    icon: 'fas fa-circle-info',
                    message: ''
                },
                toastTimer: null
            };
        },
        computed: {
            filteredUsers: function () {
                var self = this;
                var users = this.users.slice();
                var today = new Date().toDateString();

                if (this.searchTerm) {
                    var query = this.searchTerm.toLowerCase();
                    users = users.filter(function (user) {
                        return (
                            String(user.id).includes(query) ||
                            user.username.toLowerCase().includes(query) ||
                            user.email.toLowerCase().includes(query)
                        );
                    });
                }

                if (this.statusFilter === 'active') {
                    users = users.filter(function (user) {
                        return self.isActiveUser(user);
                    });
                } else if (this.statusFilter === 'inactive') {
                    users = users.filter(function (user) {
                        return !self.isActiveUser(user);
                    });
                } else if (this.statusFilter === 'today') {
                    users = users.filter(function (user) {
                        if (!user.registration_date) {
                            return false;
                        }

                        return new Date(user.registration_date).toDateString() === today;
                    });
                }

                users.sort(function (left, right) {
                    if (self.sortBy === 'usage') {
                        return (right.usage_count || 0) - (left.usage_count || 0);
                    }

                    if (self.sortBy === 'created') {
                        return new Date(right.registration_date || 0) - new Date(left.registration_date || 0);
                    }

                    if (self.sortBy === 'name') {
                        return left.username.localeCompare(right.username, 'zh-CN');
                    }

                    return new Date(right.last_used || 0) - new Date(left.last_used || 0);
                });

                return users;
            },

            paginatedUsers: function () {
                var startIndex = (this.currentPage - 1) * this.pageSize;
                return this.filteredUsers.slice(startIndex, startIndex + this.pageSize);
            },

            totalPages: function () {
                return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
            },

            averageUsage: function () {
                if (!this.stats.totalUsers) {
                    return 0;
                }

                return (this.stats.totalUsage / this.stats.totalUsers).toFixed(1);
            },

            activeRate: function () {
                if (!this.stats.totalUsers) {
                    return 0;
                }

                return Math.round((this.stats.activeUsers / this.stats.totalUsers) * 100);
            },

            topUser: function () {
                if (this.users.length === 0) {
                    return null;
                }

                return this.users.reduce(function (winner, candidate) {
                    if (!winner) {
                        return candidate;
                    }

                    return (candidate.usage_count || 0) > (winner.usage_count || 0) ? candidate : winner;
                }, null);
            },

            lastLoadedLabel: function () {
                if (!this.lastLoadedAt) {
                    return '尚未同步';
                }

                return this.formatDate(this.lastLoadedAt, true);
            }
        },
        methods: {
            requestJson: function (path, options) {
                return fetch(this.apiBase + path, options).then(safeJson);
            },

            getAuthHeaders: function (headers) {
                var finalHeaders = headers ? Object.assign({}, headers) : {};

                if (this.adminToken) {
                    finalHeaders.Authorization = 'Bearer ' + this.adminToken;
                }

                return finalHeaders;
            },

            showToast: function (message, type) {
                var iconMap = {
                    success: 'fas fa-circle-check',
                    error: 'fas fa-circle-exclamation',
                    info: 'fas fa-circle-info'
                };

                this.toast.visible = true;
                this.toast.type = type || 'info';
                this.toast.icon = iconMap[this.toast.type] || iconMap.info;
                this.toast.message = message;

                if (this.toastTimer) {
                    clearTimeout(this.toastTimer);
                }

                this.toastTimer = setTimeout(function () {
                    this.toast.visible = false;
                }.bind(this), 2800);
            },

            persistSession: function () {
                localStorage.setItem(ADMIN_TOKEN_KEY, this.adminToken);
            },

            clearSession: function () {
                localStorage.removeItem(ADMIN_TOKEN_KEY);
                this.adminToken = '';
                this.isAuthenticated = false;
                this.users = [];
                this.stats = Object.assign({}, DEFAULT_STATS);
                this.lastLoadedAt = '';
            },

            restoreSession: function () {
                var savedToken = localStorage.getItem(ADMIN_TOKEN_KEY);
                if (!savedToken) {
                    return;
                }

                this.adminToken = savedToken;
                this.isAuthenticated = true;
                this.loadDashboard(false);
            },

            handleLogin: function () {
                var self = this;

                self.loginError = '';
                if (!self.secretKey) {
                    self.loginError = '请输入管理员密钥';
                    return;
                }

                self.authLoading = true;

                self.requestJson('/api/admin/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        secretKey: self.secretKey
                    })
                }).then(function (result) {
                    if (!result.ok || !result.data.success || !result.data.token) {
                        self.loginError = result.data.msg || '管理员登录失败';
                        return;
                    }

                    self.adminToken = result.data.token;
                    self.isAuthenticated = true;
                    self.secretKey = '';
                    self.persistSession();
                    self.showToast('管理员登录成功', 'success');
                    self.loadDashboard(false);
                }).catch(function (error) {
                    console.error('Admin login failed:', error);
                    self.loginError = '无法连接后端服务';
                }).finally(function () {
                    self.authLoading = false;
                });
            },

            loadDashboard: function (manual) {
                var self = this;

                if (!self.adminToken) {
                    self.clearSession();
                    return;
                }

                self.dashboardLoading = true;

                Promise.all([
                    self.loadStats(),
                    self.loadUsers()
                ]).then(function () {
                    self.lastLoadedAt = new Date().toISOString();
                    if (manual) {
                        self.showToast('管理员数据已刷新', 'success');
                    }
                }).catch(function (error) {
                    if (error && error.code === 'UNAUTHORIZED') {
                        self.clearSession();
                        self.showToast('管理员会话已失效，请重新登录', 'error');
                        return;
                    }

                    console.error('Failed to load admin dashboard:', error);
                    self.showToast('加载管理员数据失败', 'error');
                }).finally(function () {
                    self.dashboardLoading = false;
                });
            },

            loadStats: function () {
                var self = this;

                return self.requestJson('/api/admin/stats', {
                    headers: self.getAuthHeaders()
                }).then(function (result) {
                    if (result.status === 401) {
                        throw { code: 'UNAUTHORIZED' };
                    }

                    if (!result.ok || !result.data.success || !result.data.stats) {
                        throw new Error(result.data.msg || '统计数据加载失败');
                    }

                    self.stats = {
                        totalUsers: Number(result.data.stats.totalUsers || 0),
                        totalUsage: Number(result.data.stats.totalUsage || 0),
                        activeUsers: Number(result.data.stats.activeUsers || 0),
                        todayUsers: Number(result.data.stats.todayUsers || 0)
                    };
                });
            },

            loadUsers: function () {
                var self = this;

                return self.requestJson('/api/admin/users', {
                    headers: self.getAuthHeaders()
                }).then(function (result) {
                    if (result.status === 401) {
                        throw { code: 'UNAUTHORIZED' };
                    }

                    if (!result.ok || !result.data.success || !Array.isArray(result.data.users)) {
                        throw new Error(result.data.msg || '用户数据加载失败');
                    }

                    self.users = result.data.users.map(function (user) {
                        return self.normalizeUser(user);
                    });

                    if (self.currentPage > self.totalPages) {
                        self.currentPage = self.totalPages;
                    }
                });
            },

            normalizeUser: function (user) {
                return {
                    id: Number(user.id || user.ID || 0),
                    username: String(user.username || user.USERNAME || '未知用户'),
                    email: String(user.email || user.EMAIL || '未知邮箱'),
                    usage_count: Number(user.usage_count || user.USAGE_COUNT || 0),
                    registration_date: user.registration_date || user.REGISTRATION_DATE || user.created_at || user.CREATED_AT || '',
                    last_used: user.last_used || user.LAST_USED || ''
                };
            },

            getUserInitial: function (user) {
                if (!user || !user.username) {
                    return 'U';
                }

                return user.username.slice(0, 1).toUpperCase();
            },

            isActiveUser: function (user) {
                if (!user.last_used) {
                    return false;
                }

                var lastUsed = new Date(user.last_used);
                if (Number.isNaN(lastUsed.getTime())) {
                    return false;
                }

                var threshold = new Date();
                threshold.setDate(threshold.getDate() - 30);
                return lastUsed >= threshold;
            },

            getStatusText: function (user) {
                return this.isActiveUser(user) ? '活跃' : '非活跃';
            },

            getStatusClass: function (user) {
                return this.isActiveUser(user) ? 'status-active' : 'status-inactive';
            },

            getStatusIcon: function (user) {
                return this.isActiveUser(user) ? 'fas fa-signal' : 'fas fa-moon';
            },

            getUsageTone: function (count) {
                if (!count) {
                    return 'usage-low';
                }

                if (count < 10) {
                    return 'usage-mid';
                }

                return 'usage-high';
            },

            openEditModal: function (user) {
                this.editForm = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    usage_count: Number(user.usage_count || 0),
                    last_used: this.formatDateTimeInput(user.last_used)
                };
                this.showEditModal = true;
            },

            closeEditModal: function () {
                this.showEditModal = false;
                this.modalSaving = false;
                this.editForm = {
                    id: null,
                    username: '',
                    email: '',
                    usage_count: 0,
                    last_used: ''
                };
            },

            saveUserEdit: function () {
                var self = this;

                if (!self.editForm.username || !self.editForm.email) {
                    self.showToast('用户名和邮箱不能为空', 'error');
                    return;
                }

                self.modalSaving = true;

                self.requestJson('/api/admin/users/' + self.editForm.id, {
                    method: 'PUT',
                    headers: self.getAuthHeaders({
                        'Content-Type': 'application/json'
                    }),
                    body: JSON.stringify({
                        username: self.editForm.username,
                        email: self.editForm.email,
                        usage_count: Number(self.editForm.usage_count || 0),
                        last_used: self.editForm.last_used || null
                    })
                }).then(function (result) {
                    if (result.status === 401) {
                        throw { code: 'UNAUTHORIZED' };
                    }

                    if (!result.ok || !result.data.success) {
                        throw new Error(result.data.msg || '保存用户失败');
                    }

                    self.closeEditModal();
                    self.showToast('用户信息已更新', 'success');
                    self.loadDashboard(false);
                }).catch(function (error) {
                    if (error && error.code === 'UNAUTHORIZED') {
                        self.clearSession();
                        self.showToast('管理员会话已失效，请重新登录', 'error');
                        return;
                    }

                    console.error('Failed to save user:', error);
                    self.showToast(error.message || '保存用户失败', 'error');
                }).finally(function () {
                    self.modalSaving = false;
                });
            },

            deleteUser: function (user) {
                var self = this;
                var confirmed = window.confirm('确定删除用户 "' + user.username + '" 吗？此操作不可撤销。');

                if (!confirmed) {
                    return;
                }

                self.requestJson('/api/admin/users/' + user.id, {
                    method: 'DELETE',
                    headers: self.getAuthHeaders()
                }).then(function (result) {
                    if (result.status === 401) {
                        throw { code: 'UNAUTHORIZED' };
                    }

                    if (!result.ok || !result.data.success) {
                        throw new Error(result.data.msg || '删除用户失败');
                    }

                    self.showToast('用户已删除', 'success');
                    self.loadDashboard(false);
                }).catch(function (error) {
                    if (error && error.code === 'UNAUTHORIZED') {
                        self.clearSession();
                        self.showToast('管理员会话已失效，请重新登录', 'error');
                        return;
                    }

                    console.error('Failed to delete user:', error);
                    self.showToast(error.message || '删除用户失败', 'error');
                });
            },

            resetUserPassword: function (user) {
                var self = this;
                var newPassword = window.prompt('请输入用户 "' + user.username + '" 的新密码（至少 6 位）');

                if (!newPassword) {
                    return;
                }

                if (newPassword.length < 6) {
                    self.showToast('新密码至少需要 6 位', 'error');
                    return;
                }

                self.requestJson('/api/admin/users/' + user.id + '/reset-password', {
                    method: 'POST',
                    headers: self.getAuthHeaders({
                        'Content-Type': 'application/json'
                    }),
                    body: JSON.stringify({
                        newPassword: newPassword
                    })
                }).then(function (result) {
                    if (result.status === 401) {
                        throw { code: 'UNAUTHORIZED' };
                    }

                    if (!result.ok || !result.data.success) {
                        throw new Error(result.data.msg || '重置密码失败');
                    }

                    self.showToast('密码已重置', 'success');
                }).catch(function (error) {
                    if (error && error.code === 'UNAUTHORIZED') {
                        self.clearSession();
                        self.showToast('管理员会话已失效，请重新登录', 'error');
                        return;
                    }

                    console.error('Failed to reset password:', error);
                    self.showToast(error.message || '重置密码失败', 'error');
                });
            },

            exportUsers: function () {
                var self = this;
                var xlsx = window.XLSX;

                if (self.users.length === 0) {
                    self.showToast('没有可导出的用户数据', 'error');
                    return;
                }

                if (!xlsx || !xlsx.utils || !xlsx.writeFile) {
                    self.showToast('Excel 导出组件加载失败', 'error');
                    return;
                }

                var exportRows = self.filteredUsers.slice();
                var generatedAt = new Date();
                var summaryRows = [
                    ['生成时间', generatedAt.toLocaleString('zh-CN')],
                    ['导出范围', (self.searchTerm || self.statusFilter !== 'all') ? '当前筛选结果' : '全部用户'],
                    ['导出条数', exportRows.length],
                    ['系统用户总数', self.stats.totalUsers],
                    ['累计识别次数', self.stats.totalUsage],
                    ['活跃用户数', self.stats.activeUsers],
                    ['今日新增用户', self.stats.todayUsers]
                ];
                var detailRows = exportRows.map(function (user) {
                    return {
                        ID: user.id,
                        用户名: user.username,
                        邮箱: user.email,
                        识别次数: user.usage_count,
                        注册时间: self.formatDate(user.registration_date, true),
                        最近使用: self.formatDate(user.last_used, true),
                        状态: self.getStatusText(user)
                    };
                });
                var workbook = xlsx.utils.book_new();
                var summarySheet = xlsx.utils.aoa_to_sheet(summaryRows);
                var detailSheet = xlsx.utils.json_to_sheet(detailRows);

                summarySheet['!cols'] = [
                    { wch: 18 },
                    { wch: 28 }
                ];
                detailSheet['!cols'] = [
                    { wch: 10 },
                    { wch: 18 },
                    { wch: 30 },
                    { wch: 12 },
                    { wch: 22 },
                    { wch: 22 },
                    { wch: 12 }
                ];

                xlsx.utils.book_append_sheet(workbook, summarySheet, '统计摘要');
                xlsx.utils.book_append_sheet(workbook, detailSheet, '用户列表');
                xlsx.writeFile(workbook, 'admin-users-' + generatedAt.toISOString().slice(0, 10) + '.xlsx');

                self.showToast('Excel 已导出', 'success');
            },

            logout: function () {
                this.clearSession();
                this.secretKey = '';
                this.loginError = '';
                this.currentPage = 1;
                this.showToast('已退出管理员控制台', 'info');
            },

            scrollToSection: function (sectionId) {
                var target = document.getElementById(sectionId);
                if (!target) {
                    return;
                }

                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            },

            goPrevPage: function () {
                if (this.currentPage > 1) {
                    this.currentPage -= 1;
                }
            },

            goNextPage: function () {
                if (this.currentPage < this.totalPages) {
                    this.currentPage += 1;
                }
            },

            formatDate: function (value, withTime) {
                if (!value) {
                    return '未记录';
                }

                var date = new Date(value);
                if (Number.isNaN(date.getTime())) {
                    return '未记录';
                }

                var options = withTime
                    ? {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }
                    : {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    };

                return date.toLocaleString('zh-CN', options);
            },

            formatRelativeDate: function (value) {
                if (!value) {
                    return '从未使用';
                }

                var date = new Date(value);
                if (Number.isNaN(date.getTime())) {
                    return '从未使用';
                }

                var diffMs = Date.now() - date.getTime();
                var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                var diffDays = Math.floor(diffHours / 24);

                if (diffHours < 1) {
                    return '刚刚活跃';
                }

                if (diffHours < 24) {
                    return diffHours + ' 小时前';
                }

                if (diffDays < 30) {
                    return diffDays + ' 天前';
                }

                return this.formatDate(value);
            },

            formatDateTimeInput: function (value) {
                if (!value) {
                    return '';
                }

                var date = new Date(value);
                if (Number.isNaN(date.getTime())) {
                    return '';
                }

                var pad = function (number) {
                    return String(number).padStart(2, '0');
                };

                return [
                    date.getFullYear(),
                    '-',
                    pad(date.getMonth() + 1),
                    '-',
                    pad(date.getDate()),
                    'T',
                    pad(date.getHours()),
                    ':',
                    pad(date.getMinutes())
                ].join('');
            }
        },
        watch: {
            searchTerm: function () {
                this.currentPage = 1;
            },

            statusFilter: function () {
                this.currentPage = 1;
            },

            sortBy: function () {
                this.currentPage = 1;
            },

            filteredUsers: function () {
                if (this.currentPage > this.totalPages) {
                    this.currentPage = this.totalPages;
                }
            }
        },
        mounted: function () {
            this.restoreSession();
        },
        beforeDestroy: function () {
            if (this.toastTimer) {
                clearTimeout(this.toastTimer);
            }
        }
    });
}());
