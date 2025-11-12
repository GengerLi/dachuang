// app.js - 行人重识别系统前端逻辑（数据库接入版）
new Vue({
    el: '#app',
    data: {
        // 用户认证状态
        isLoggedIn: false,
        currentUser: '',
        currentUserEmail: '',
        currentAuthForm: 'login', // login, register, reset
        authLoading: false,

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
        activeTab: 'home', // home, recognition, settings

        // 图片处理相关
        uploadedImage: null,
        matchedImages: [], // 修改为数组，支持多个匹配结果
        processingImage: false,
        matchedImage: null, // 新增：单个匹配图片
        matchedInfo: null, 

        // 用户数据
        usageCount: 0,
        lastUsed: null,
        registrationDate: null,
        settings: {
            notifications: true,
            autoSave: true
        }
    },
    computed: {
        // 密码强度样式类
        passwordStrengthClass() {
            return this.passwordStrength ? `password-strength ${this.passwordStrength}` : 'password-strength';
        },

        // 密码强度文字
        getPasswordStrengthText() {
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
        getPasswordStrengthIcon() {
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
        getPasswordSuggestionsText() {
            if (this.passwordSuggestions.length === 0) return '';
            return '建议：' + this.passwordSuggestions.join('、');
        },
        
        // 格式化最后使用时间显示 - 主页使用
        formattedLastUsed() {
            if (!this.lastUsed) {
                return '从未使用';
            }
            try {
                const date = new Date(this.lastUsed);
                if (isNaN(date.getTime())) {
                    return '从未使用';
                }

                const now = new Date();
                const diffInMs = now - date;
                const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
                const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
                const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

                if (diffInMinutes < 1) {
                    return '刚刚';
                } else if (diffInMinutes < 60) {
                    return `${diffInMinutes}分钟前`;
                } else if (diffInHours < 24) {
                    return `${diffInHours}小时前`;
                } else if (diffInDays < 7) {
                    return `${diffInDays}天前`;
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
        formattedRegistrationDate() {
            if (!this.registrationDate) {
                return '未知';
            }
            try {
                const date = new Date(this.registrationDate);
                if (isNaN(date.getTime())) {
                    return '未知';
                }

                // 只显示日期
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
        formattedLastUsedForSettings() {
            if (!this.lastUsed) {
                return '从未使用';
            }
            try {
                const date = new Date(this.lastUsed);
                if (isNaN(date.getTime())) {
                    return '从未使用';
                }

                // 显示完整日期和时间
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
        }
    },
    methods: {
        // ========== 认证相关方法 ==========

        /**
         * 用户登录
         */
        async login() {
            // 重置错误状态
            this.loginErrors = { username: false, password: false };
            
            // 基本验证
            let hasError = false;
            if (!this.loginForm.username.trim()) {
                this.loginErrors.username = true;
                hasError = true;
            }
            if (!this.loginForm.password) {
                this.loginErrors.password = true;
                hasError = true;
            }
            
            if (hasError) return;

            this.authLoading = true;

            try {
                const response = await fetch('http://localhost:3000/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: this.loginForm.username.trim(),
                        password: this.loginForm.password
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // 登录成功
                    this.loginSuccess = true;
                    this.isLoggedIn = true;
                    this.currentUser = data.user.username;
                    this.currentUserEmail = data.user.email;
                    
                    // 更新用户数据
                    this.usageCount = data.user.usageCount || 0;
                    this.lastUsed = data.user.lastUsed;
                    this.registrationDate = data.user.registrationDate;
                    this.settings = data.user.settings || this.settings;

                    // 保存登录状态到本地存储
                    if (this.loginForm.remember) {
                        localStorage.setItem('currentUser', this.currentUser);
                        localStorage.setItem('currentUserEmail', this.currentUserEmail);
                    }

                    // 重置表单
                    setTimeout(() => {
                        this.loginSuccess = false;
                        this.resetLoginForm();
                    }, 2000);

                    console.log('登录成功:', this.currentUser);
                } else {
                    alert(data.msg || '登录失败');
                }
            } catch (error) {
                console.error('登录失败:', error);
                alert('登录失败，请检查网络连接后重试');
            } finally {
                this.authLoading = false;
            }
        },


        /**
         * 用户注册
         */
        async register() {
            // 重置错误状态
            this.registerErrors = { username: false, email: false, password: false, confirmPassword: false };
            
            // 表单验证
            if (!this.validateRegisterForm()) {
                return;
            }
            
            // 检查密码强度并给出提醒（但不阻止注册）
            if (this.passwordStrength === 'weak') {
                const suggestionText = this.passwordSuggestions.length > 0 
                    ? `\n\n改进建议：${this.passwordSuggestions.join('、')}`
                    : '';
                    
                const userConfirmed = confirm(
                    `您的密码强度较弱，可能存在安全风险。${suggestionText}\n\n是否继续使用当前密码？`
                );
                if (!userConfirmed) {
                    return; // 用户选择取消，不进行注册
                }
            }

            this.authLoading = true;

            try {
                const response = await fetch('http://localhost:3000/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: this.registerForm.username.trim(),
                        email: this.registerForm.email.trim(),
                        password: this.registerForm.password
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.registerSuccess = true;

                    // 显示成功信息后返回登录页
                    setTimeout(() => {
                        this.registerSuccess = false;
                        this.resetRegisterForm();
                        this.currentAuthForm = 'login';
                        alert('注册成功！请登录您的账户。');
                    }, 2000);

                    console.log('注册成功:', this.registerForm.username);
                } else {
                    // 现在只有邮箱可能冲突
                    if (data.msg.includes('邮箱')) {
                        this.registerErrors.email = true;
                    }
                    alert(data.msg || '注册失败');
                }
            } catch (error) {
                console.error('注册失败:', error);
                alert('注册失败，请检查网络连接后重试');
            } finally {
                this.authLoading = false;
            }
        },
        /**
         * 重置密码
         */
        async resetPassword() {
            // 重置错误状态
            this.resetErrors = { email: false };
            
            if (!this.resetForm.email.trim()) {
                this.resetErrors.email = true;
                alert('请输入邮箱地址');
                return;
            }

            // 简单的邮箱格式验证
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(this.resetForm.email.trim())) {
                this.resetErrors.email = true;
                alert('请输入有效的邮箱地址');
                return;
            }

            this.authLoading = true;

            try {
                const response = await fetch('http://localhost:3000/api/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: this.resetForm.email.trim()
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // 模拟发送重置邮件
                    this.resetSuccess = true;

                    // 重置表单并返回登录页
                    setTimeout(() => {
                        this.resetForm.email = '';
                        this.resetSuccess = false;
                        this.currentAuthForm = 'login';
                        alert('重置链接已发送到您的邮箱，请查收。');
                    }, 3000);
                } else {
                    alert(data.msg || '发送失败');
                }
            } catch (error) {
                console.error('发送失败:', error);
                alert('发送失败，请检查网络连接后重试');
            } finally {
                this.authLoading = false;
            }
        },

        /**
         * 用户退出登录
         */
        logout() {
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

            console.log('用户已退出登录');
        },

        // ========== 表单验证方法 ==========

        /**
         * 验证注册表单
         */
        validateRegisterForm() {
            const { username, email, password, confirmPassword } = this.registerForm;
            let isValid = true;

            // 用户名验证
            if (!username.trim()) {
                this.registerErrors.username = true;
                isValid = false;
            } else if (username.length < 3) {
                alert('用户名至少需要3个字符');
                isValid = false;
            }

            // 邮箱验证
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                this.registerErrors.email = true;
                isValid = false;
            }

            // 密码验证 - 放宽要求，只检查最小长度
            if (!password || password.length < 6) {
                this.registerErrors.password = true;
                isValid = false;
                // 添加具体的错误提示
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
        checkPasswordStrength() {
            const password = this.registerForm.password;
            this.passwordSuggestions = [];

            if (password.length === 0) {
                this.passwordStrength = '';
                return;
            }

            let strength = 0;

            // 基础长度检查
            if (password.length >= 6) strength += 1;
            if (password.length >= 8) strength += 1;
            if (password.length >= 12) strength += 2; // 长密码给予更高权重

            // 字符类型检查
            const hasLower = /[a-z]/.test(password);
            const hasUpper = /[A-Z]/.test(password);
            const hasDigit = /\d/.test(password);
            const hasSpecial = /[^a-zA-Z\d]/.test(password);

            if (hasLower) strength += 1;
            if (hasUpper) strength += 1;
            if (hasDigit) strength += 1;
            if (hasSpecial) strength += 2; // 特殊字符给予更高权重

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
        triggerFileInput() {
            this.$refs.fileInput.click();
        },

        /**
         * 处理文件选择
         */
        handleFileSelect(event) {
            const file = event.target.files[0];
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

                this.readImageFile(file);
            }
        },

        /**
         * 处理拖放文件
         */
        handleDrop(event) {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.readImageFile(file);
            }
        },

        /**
         * 读取图片文件
         */
        readImageFile(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.uploadedImage = e.target.result;
                this.matchedImages = [];
                console.log('图片上传成功');
            };
            reader.onerror = () => {
                alert('图片读取失败，请重试');
            };
            reader.readAsDataURL(file);
        },

        /**
         * 处理图片识别
         */
        /**
 * 处理图片识别（调用后端 Python ReID 模型）
 */
        async processImage() {
            if (!this.uploadedImage) {
                alert('请先上传图片');
                return;
            }

            this.processingImage = true;
            this.matchedImages = [];
            this.matchedImage = null; // 新增：确保匹配图清空
            this.matchedInfo = null;  // 新增：清空相似度与距离信息

            try {
                // 将base64图片转换为blob
                const response = await fetch(this.uploadedImage);
                const blob = await response.blob();

                // 构建FormData发送到后端
                const formData = new FormData();
                formData.append('image', blob, 'query.jpg');
                formData.append('email', this.currentUserEmail);

                // 调用后端识别接口
                const reidResponse = await fetch('http://localhost:3000/api/reid', {
                    method: 'POST',
                    body: formData
                });

                const data = await reidResponse.json();

                if (data.success) {
                    // 显示匹配图片
                    this.matchedImage = `http://localhost:3000${data.match.imageUrl}`;

                    // 保存相似度与距离
                    this.matchedInfo = {
                        similarity: data.match.similarity,
                        distance: data.match.distance
                    };

                    // 更新使用统计
                    this.usageCount++;
                    this.lastUsed = new Date().toISOString();

                    console.log('图片识别完成，最相似结果:', this.matchedInfo);
                } else {
                    alert(data.msg || '识别失败');
                }
            } catch (error) {
                console.error('图片处理失败:', error);
                alert('图片处理失败，请检查网络连接或后端服务后重试');
            } finally {
                this.processingImage = false;
            }
        },


        /**
         * 清除图片
         */
        clearImages() {
            this.uploadedImage = null;
            this.matchedImages = [];
            if (this.$refs.fileInput) {
                this.$refs.fileInput.value = '';
            }
            console.log('图片已清除');
        },

        // ========== 工具方法 ==========

        /**
         * 重置登录表单
         */
        resetLoginForm() {
            this.loginForm = {
                username: '',
                password: '',
                remember: false
            };
            this.showLoginPassword = false;
            this.loginErrors = { username: false, password: false };
        },

        /**
         * 重置注册表单
         */
        resetRegisterForm() {
            this.registerForm = {
                username: '',
                email: '',
                password: '',
                confirmPassword: ''
            };
            this.showRegisterPassword = false;
            this.showConfirmPassword = false;
            this.passwordStrength = '';
            this.passwordSuggestions = [];
            this.registerErrors = { username: false, email: false, password: false, confirmPassword: false };
        },

        /**
         * 重置图片数据
         */
        resetImageData() {
            this.uploadedImage = null;
            this.matchedImages = [];
            this.processingImage = false;
        }
    },
    mounted() {
        // 应用初始化
        console.log('行人重识别系统初始化');

        // 检查登录状态
        const savedUser = localStorage.getItem('currentUser');
        const savedEmail = localStorage.getItem('currentUserEmail');
        
        if (savedUser && savedEmail) {
            // 这里可以添加自动登录验证
            // 暂时只是显示用户信息，实际应该验证token或session
            this.isLoggedIn = true;
            this.currentUser = savedUser;
            this.currentUserEmail = savedEmail;
            
            // 加载用户数据（这里需要调用API获取最新数据）
            console.log('自动登录用户:', savedUser);
        }

        // 设置默认标签页
        this.activeTab = 'home';
    },
    
    watch: {
        // 监听设置变化
        settings: {
            handler(newSettings) {
                if (this.isLoggedIn) {
                    // 保存设置到服务器
                    fetch('http://localhost:3000/api/user/settings', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            email: this.currentUserEmail,
                            settings: newSettings
                        })
                    }).catch(error => {
                        console.error('保存设置失败:', error);
                    });
                }
            },
            deep: true
        }
    }
});