(function () {
    var SESSION_KEY = 'reid_platform_session_v1';
    var SETTINGS_KEY = 'reid_platform_settings_v1';
    var PREVIEW_MODE_KEY = 'reid_platform_preview_mode';
    var DATA_MODE_KEY = 'reid_platform_data_mode';
    var API_BASE_KEY = 'reid_platform_api_base_url';
    var NAV_ITEMS = [
        { route: 'home', label: '首页', icon: 'fas fa-house' },
        { route: 'monitoring', label: '实时监测', icon: 'fas fa-display' },
        { route: 'statistics', label: '数据统计', icon: 'fas fa-chart-column' },
        { route: 'reid', label: '行人重识别', icon: 'fas fa-user-check' },
        { route: 'history', label: '历史记录', icon: 'fas fa-clock-rotate-left' },
        { route: 'settings', label: '设置', icon: 'fas fa-sliders' }
    ];
    var MOCK = window.REID_MOCK_DATA || {};
    var REID_WORKBENCH = window.REID_WORKBENCH || {};
    var PLATFORM_INSIGHTS = window.PLATFORM_INSIGHTS || {};
    var REID_API = window.REID_API || {};

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clampNumber(value, min, max, fallbackValue) {
        var parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return fallbackValue;
        }

        return Math.min(max, Math.max(min, parsed));
    }

    function clampInteger(value, min, max, fallbackValue) {
        var parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed)) {
            return fallbackValue;
        }

        return Math.min(max, Math.max(min, parsed));
    }

    function createDefaultSettings() {
        var source = deepClone(MOCK.settings || {});
        var defaults = source.defaults || {};

        return {
            notifications: source.notifications !== false,
            autoSave: source.autoSave !== false,
            soundAlerts: !!source.soundAlerts,
            theme: source.theme || 'system-blue',
            defaults: {
                confidence: clampNumber(defaults.confidence, 0, 1, 0.72),
                iou: clampNumber(defaults.iou, 0, 1, 0.45),
                similarity: clampNumber(defaults.similarity, 0, 1, 0.88),
                topK: clampInteger(defaults.topK, 1, 10, 5),
                sourceType: defaults.sourceType || 'localVideo'
            }
        };
    }

    function normalizeSettings(settingsValue) {
        var base = createDefaultSettings();
        var nextSettings = settingsValue && typeof settingsValue === 'object' ? settingsValue : {};
        var nextDefaults = nextSettings.defaults && typeof nextSettings.defaults === 'object'
            ? nextSettings.defaults
            : {};

        return {
            notifications: typeof nextSettings.notifications === 'boolean'
                ? nextSettings.notifications
                : base.notifications,
            autoSave: typeof nextSettings.autoSave === 'boolean'
                ? nextSettings.autoSave
                : base.autoSave,
            soundAlerts: typeof nextSettings.soundAlerts === 'boolean'
                ? nextSettings.soundAlerts
                : base.soundAlerts,
            theme: typeof nextSettings.theme === 'string' && nextSettings.theme
                ? nextSettings.theme
                : base.theme,
            defaults: {
                confidence: clampNumber(nextDefaults.confidence, 0, 1, base.defaults.confidence),
                iou: clampNumber(nextDefaults.iou, 0, 1, base.defaults.iou),
                similarity: clampNumber(nextDefaults.similarity, 0, 1, base.defaults.similarity),
                topK: clampInteger(nextDefaults.topK, 1, 10, base.defaults.topK),
                sourceType: nextDefaults.sourceType || base.defaults.sourceType
            }
        };
    }

    function createInitialReidState(settings) {
        if (REID_WORKBENCH.createInitialState) {
            return REID_WORKBENCH.createInitialState(MOCK, settings);
        }

        return {
            sourceOptions: [],
            selectedSourceType: 'localVideo',
            defaultParams: {
                confThreshold: 0.72,
                iouThreshold: 0.45,
                similarityThreshold: 0.88,
                topK: 5,
                autoSaveResult: true,
                defaultSource: 'localVideo'
            },
            params: {
                confThreshold: 0.72,
                iouThreshold: 0.45,
                similarityThreshold: 0.88,
                topK: 5,
                autoSaveResult: true
            },
            queryImage: {
                name: '',
                url: '',
                sizeBytes: 0,
                sizeText: '',
                width: 0,
                height: 0,
                uploadedAt: '',
                fileName: '',
                source: 'upload'
            },
            queryTask: {
                id: '',
                queryImage: '',
                sourceType: 'localVideo',
                sourceName: '视频库',
                status: 'idle',
                startedAt: '',
                elapsedMs: 0
            },
            progress: {
                progress: 0,
                detectedCandidates: 0,
                matchedCandidates: 0,
                finishedResults: 0
            },
            logs: [],
            results: [],
            selectedResultId: '',
            trajectory: [],
            currentFrame: {
                title: '当前处理帧',
                caption: '任务开始后展示关键抽帧',
                image: '',
                timestamp: '--:--'
            },
            resultVideo: {
                title: '结果视频区',
                clipName: '等待生成结果片段',
                description: '完成任务后承接视频回放模块。',
                duration: '--:--'
            },
            hints: [],
            isProcessing: false
        };
    }

    function parseHashRoute() {
        var hash = window.location.hash || '';
        var route = hash.replace(/^#\/?/, '').trim();
        var index;

        if (!route) {
            return 'home';
        }

        for (index = 0; index < NAV_ITEMS.length; index += 1) {
            if (NAV_ITEMS[index].route === route) {
                return route;
            }
        }

        return 'home';
    }

    function isPreviewModeEnabled() {
        var searchParams = new URLSearchParams(window.location.search || '');
        var queryValue = searchParams.get('preview');

        if (queryValue === '1') {
            return true;
        }

        return false;
    }

    function getDataMode() {
        var searchParams = new URLSearchParams(window.location.search || '');
        var queryMode = (searchParams.get('mode') || '').trim().toLowerCase();

        if (queryMode === 'real') {
            localStorage.setItem(DATA_MODE_KEY, 'real');
            return 'real';
        }

        if (queryMode === 'mock' || queryMode === 'preview') {
            localStorage.setItem(DATA_MODE_KEY, 'mock');
            return 'mock';
        }

        return localStorage.getItem(DATA_MODE_KEY) === 'real' ? 'real' : 'mock';
    }

    function getApiBaseUrl() {
        var searchParams = new URLSearchParams(window.location.search || '');
        var queryApiBase = (searchParams.get('apiBase') || '').trim();

        if (queryApiBase) {
            localStorage.setItem(API_BASE_KEY, queryApiBase);
            return queryApiBase.replace(/\/+$/, '');
        }

        queryApiBase = (localStorage.getItem(API_BASE_KEY) || '').trim();
        if (queryApiBase) {
            return queryApiBase.replace(/\/+$/, '');
        }

        if (window.location.port === '4180' || window.location.port === '4173') {
            return 'http://127.0.0.1:3000';
        }

        return window.location.origin.replace(/\/+$/, '');
    }

    function formatDate(value, withTime) {
        if (!value) {
            return '未记录';
        }

        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '未记录';
        }

        return date.toLocaleString('zh-CN', withTime ? {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: withTime === 'with-seconds' ? '2-digit' : undefined,
            hour12: false
        } : {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    function formatRelativeTime(value) {
        if (!value) {
            return '未记录';
        }

        var date = new Date(value);
        var diffMs;
        var diffMinutes;
        var diffHours;
        var diffDays;

        if (Number.isNaN(date.getTime())) {
            return '未记录';
        }

        diffMs = Date.now() - date.getTime();
        diffMinutes = Math.floor(diffMs / (1000 * 60));
        diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMinutes < 1) {
            return '刚刚';
        }

        if (diffMinutes < 60) {
            return diffMinutes + ' 分钟前';
        }

        if (diffHours < 24) {
            return diffHours + ' 小时前';
        }

        if (diffDays < 7) {
            return diffDays + ' 天前';
        }

        return formatDate(value, true);
    }

    function formatDuration(ms) {
        var totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        return [
            String(hours).padStart(2, '0'),
            String(minutes).padStart(2, '0'),
            String(seconds).padStart(2, '0')
        ].join(':');
    }

    function formatFileSize(sizeBytes) {
        var size = Number(sizeBytes || 0);

        if (!Number.isFinite(size) || size <= 0) {
            return '0 KB';
        }

        if (size >= 1024 * 1024) {
            return (size / (1024 * 1024)).toFixed(2) + ' MB';
        }

        if (size >= 1024) {
            return (size / 1024).toFixed(1) + ' KB';
        }

        return size + ' B';
    }

    function recordStatusMeta(status) {
        var metaMap = {
            verified: {
                text: '已核验',
                icon: 'fas fa-circle-check',
                klass: 'is-verified'
            },
            review: {
                text: '待复核',
                icon: 'fas fa-user-clock',
                klass: 'is-review'
            },
            alert: {
                text: '预警',
                icon: 'fas fa-triangle-exclamation',
                klass: 'is-alert'
            }
        };

        return metaMap[status] || {
            text: '未分类',
            icon: 'fas fa-circle-question',
            klass: 'is-neutral'
        };
    }

    function serviceStatusMeta(status) {
        var metaMap = {
            running: {
                text: '运行中',
                icon: 'fas fa-circle-check',
                klass: 'is-running'
            },
            syncing: {
                text: '同步中',
                icon: 'fas fa-rotate',
                klass: 'is-syncing'
            },
            offline: {
                text: '离线',
                icon: 'fas fa-circle-stop',
                klass: 'is-offline'
            },
            error: {
                text: '异常',
                icon: 'fas fa-circle-exclamation',
                klass: 'is-error'
            }
        };

        return metaMap[status] || {
            text: '未知',
            icon: 'fas fa-circle-question',
            klass: 'is-offline'
        };
    }

    function reidTaskStatusMeta(status) {
        var metaMap = {
            idle: {
                text: '待开始',
                klass: 'is-neutral',
                icon: 'fas fa-hourglass-half'
            },
            uploaded: {
                text: '已上传',
                klass: 'is-syncing',
                icon: 'fas fa-arrow-up-from-bracket'
            },
            processing: {
                text: '处理中',
                klass: 'is-review',
                icon: 'fas fa-spinner'
            },
            submitting: {
                text: '提交中',
                klass: 'is-syncing',
                icon: 'fas fa-cloud-arrow-up'
            },
            completed: {
                text: '已完成',
                klass: 'is-verified',
                icon: 'fas fa-circle-check'
            },
            empty: {
                text: '无结果',
                klass: 'is-neutral',
                icon: 'fas fa-magnifying-glass'
            },
            failed: {
                text: '请求失败',
                klass: 'is-error',
                icon: 'fas fa-circle-exclamation'
            },
            timeout: {
                text: '请求超时',
                klass: 'is-alert',
                icon: 'fas fa-hourglass-end'
            }
        };

        return metaMap[status] || metaMap.idle;
    }

    Vue.component('page-hero', {
        props: {
            title: {
                type: String,
                default: ''
            },
            subtitle: {
                type: String,
                default: ''
            },
            actions: {
                type: Array,
                default: function () {
                    return [];
                }
            }
        },
        template: [
            '<section class="page-hero">',
            '  <div>',
            '    <h2>{{ title }}</h2>',
            '    <p>{{ subtitle }}</p>',
            '  </div>',
            '  <div v-if="actions.length > 0" class="page-hero-actions">',
            '    <button',
            '      v-for="action in actions"',
            '      :key="action.key"',
            '      type="button"',
            '      :class="action.kind === \'secondary\' ? \'secondary-btn\' : \'primary-btn\'"',
            '      @click="$emit(\'action\', action.key)"',
            '    >',
            '      <i v-if="action.icon" :class="action.icon"></i>',
            '      <span>{{ action.label }}</span>',
            '    </button>',
            '  </div>',
            '</section>'
        ].join('')
    });

    Vue.component('stat-card', {
        props: {
            title: {
                type: String,
                default: ''
            },
            value: {
                type: [String, Number],
                default: ''
            },
            unit: {
                type: String,
                default: ''
            },
            caption: {
                type: String,
                default: ''
            },
            icon: {
                type: String,
                default: 'fas fa-chart-simple'
            },
            tone: {
                type: String,
                default: 'neutral'
            }
        },
        computed: {
            toneClass: function () {
                var toneMap = {
                    success: 'is-success',
                    warning: 'is-warning',
                    danger: 'is-danger',
                    info: 'is-success',
                    primary: '',
                    neutral: ''
                };

                return toneMap[this.tone] || '';
            }
        },
        template: [
            '<article class="metric-card" :class="toneClass">',
            '  <div class="metric-card-header">',
            '    <span class="metric-card-title">{{ title }}</span>',
            '    <span class="metric-card-icon"><i :class="icon"></i></span>',
            '  </div>',
            '  <div class="metric-card-value">',
            '    <strong>{{ value }}</strong>',
            '    <span v-if="unit">{{ unit }}</span>',
            '  </div>',
            '  <div class="metric-card-foot">{{ caption }}</div>',
            '</article>'
        ].join('')
    });

    Vue.component('empty-state', {
        props: {
            icon: {
                type: String,
                default: 'fas fa-box-open'
            },
            title: {
                type: String,
                default: '暂无数据'
            },
            description: {
                type: String,
                default: ''
            }
        },
        template: [
            '<div class="empty-state">',
            '  <i :class="icon"></i>',
            '  <h4>{{ title }}</h4>',
            '  <p>{{ description }}</p>',
            '</div>'
        ].join('')
    });

    Vue.component('loading-state', {
        props: {
            icon: {
                type: String,
                default: 'fas fa-spinner'
            },
            title: {
                type: String,
                default: '正在加载'
            },
            description: {
                type: String,
                default: ''
            }
        },
        template: [
            '<div class="loading-state">',
            '  <i :class="icon"></i>',
            '  <h4>{{ title }}</h4>',
            '  <p>{{ description }}</p>',
            '</div>'
        ].join('')
    });

    Vue.component('safe-image', {
        props: {
            src: {
                type: String,
                default: ''
            },
            alt: {
                type: String,
                default: ''
            },
            icon: {
                type: String,
                default: 'fas fa-image'
            },
            text: {
                type: String,
                default: '图片加载失败'
            }
        },
        data: function () {
            return {
                loadFailed: false
            };
        },
        watch: {
            src: function () {
                this.loadFailed = false;
            }
        },
        template: [
            '<div class="safe-image">',
            '  <img v-if="src && !loadFailed" :src="src" :alt="alt" @error="loadFailed = true">',
            '  <div v-else class="safe-image-fallback">',
            '    <i :class="icon"></i>',
            '    <span>{{ text }}</span>',
            '  </div>',
            '</div>'
        ].join('')
    });

    new Vue({
        el: '#app',
        data: function () {
            var normalizedSettings = normalizeSettings();

            return {
                navItems: NAV_ITEMS,
                currentRoute: parseHashRoute(),
                dataMode: getDataMode(),
                apiBaseUrl: getApiBaseUrl(),
                isLoggedIn: false,
                isPreviewMode: false,
                authLoading: false,
                loginSuccess: false,
                currentUser: '',
                currentUserEmail: '',
                authToken: '',
                usageCount: Number((MOCK.user || {}).usageCount || 0),
                lastUsed: (MOCK.user || {}).lastUsed || '',
                registrationDate: (MOCK.user || {}).registrationDate || '',
                currentAuthForm: 'login',
                loginForm: {
                    username: '',
                    password: '',
                    remember: true
                },
                loginErrors: {
                    username: false,
                    password: false
                },
                registerForm: {
                    username: '',
                    email: '',
                    emailCode: '',
                    password: '',
                    confirmPassword: ''
                },
                registerErrors: {
                    username: false,
                    email: false,
                    emailCode: false,
                    password: false,
                    confirmPassword: false
                },
                registerCodeLoading: false,
                registerCodeCooldown: 0,
                registerCodeTimer: null,
                registerCodeMessage: '',
                resetForm: {
                    email: '',
                    emailCode: '',
                    newPassword: '',
                    confirmPassword: ''
                },
                resetErrors: {
                    email: false,
                    emailCode: false,
                    newPassword: false,
                    confirmPassword: false
                },
                resetCodeLoading: false,
                resetCodeCooldown: 0,
                resetCodeTimer: null,
                resetCodeMessage: '',
                showLoginPassword: false,
                showRegisterPassword: false,
                showConfirmPassword: false,
                passwordStrength: '',
                settings: normalizedSettings,
                overviewStats: deepClone((MOCK.overview || {}).stats || []),
                overviewShortcuts: deepClone((MOCK.overview || {}).shortcuts || []),
                recentRecords: deepClone((MOCK.overview || {}).recentRecords || []),
                systemStatus: deepClone((MOCK.overview || {}).systemStatus || []),
                monitoringSummary: deepClone((MOCK.monitoring || {}).summary || {}),
                monitoringCameras: deepClone((MOCK.monitoring || {}).cameras || []),
                monitoringHeatmapZones: deepClone((MOCK.monitoring || {}).heatmapZones || []),
                monitoringTimeline: deepClone((MOCK.monitoring || {}).timeline || []),
                statisticsSummary: deepClone((MOCK.statistics || {}).summary || {}),
                statisticsTrend: deepClone((MOCK.statistics || {}).trend || []),
                statisticsZones: deepClone((MOCK.statistics || {}).zones || []),
                statisticsCapacity: deepClone((MOCK.statistics || {}).capacity || {}),
                historyFilterOptions: deepClone((MOCK.history || {}).filters || {
                    cameras: ['全部'],
                    locations: ['全部'],
                    statuses: ['全部']
                }),
                historyFilters: {
                    search: '',
                    camera: '全部',
                    location: '全部',
                    status: '全部'
                },
                historyRecords: deepClone((MOCK.history || {}).records || []),
                historyLoading: false,
                historyError: '',
                historyPagination: {
                    page: 1,
                    pageSize: 20,
                    total: deepClone((MOCK.history || {}).records || []).length
                },
                recentRecordsLoading: false,
                recentRecordsError: '',
                reidState: createInitialReidState(normalizedSettings),
                selectedMonitoringZoneName: ((((MOCK.monitoring || {}).heatmapZones) || [])[0] || {}).name || '',
                selectedMonitoringTimelineIndex: 0,
                showHistoryDetail: false,
                selectedRecord: null,
                detailLoading: false,
                toasts: [],
                toastSeed: 0,
                reidProgressTimer: null,
                reidElapsedTimer: null,
                historyFetchTimer: null
            };
        },
        computed: {
            pageHeader: function () {
                var headerMap = {
                    home: {
                        title: '系统总览',
                        actions: [
                            { key: 'go-monitoring', label: '进入实时监测', icon: 'fas fa-display', kind: 'secondary' },
                            { key: 'go-reid', label: '打开重识别工作台', icon: 'fas fa-user-check', kind: 'primary' }
                        ]
                    },
                    monitoring: {
                        title: '实时监测',
                        subtitle: '集中展示景区重点区域监测画面、摄像头在线状态、热度分布与客流变化。',
                        actions: [
                            { key: 'refresh-monitoring', label: '刷新监测视图', icon: 'fas fa-rotate', kind: 'secondary' }
                        ]
                    },
                    statistics: {
                        title: '数据统计',
                        subtitle: '集中展示客流规模、区域负载、承载压力、分析结论与系统建议。',
                        actions: [
                            { key: 'refresh-statistics', label: '刷新统计数据', icon: 'fas fa-arrows-rotate', kind: 'secondary' }
                        ]
                    },
                    reid: {
                        title: '行人重识别工作台',
                        subtitle: '支持查询图上传、参数配置、Top-K 匹配与结果追踪。',
                        actions: [
                            { key: 'load-sample-query', label: '载入示例', icon: 'fas fa-wand-magic-sparkles', kind: 'secondary' },
                            { key: 'run-sample-reid', label: '开始识别', icon: 'fas fa-bolt', kind: 'primary' },
                            { key: 'reset-reid-params', label: '重置', icon: 'fas fa-rotate-left', kind: 'secondary' }
                        ]
                    },
                    history: {
                        title: '历史记录',
                        subtitle: '支持历史记录查看、结果筛选与详情追溯。',
                        actions: [
                            { key: 'reset-history-filters', label: '重置筛选条件', icon: 'fas fa-filter-circle-xmark', kind: 'secondary' }
                        ]
                    },
                    settings: {
                        title: '设置',
                        subtitle: '统一管理用户偏好和默认参数，当前设置会直接影响行人重识别工作台初始值。',
                        actions: [
                            { key: 'restore-default-settings', label: '恢复默认参数', icon: 'fas fa-rotate-left', kind: 'secondary' },
                            { key: 'save-settings', label: '保存设置', icon: 'fas fa-floppy-disk', kind: 'primary' }
                        ]
                    }
                };

                return headerMap[this.currentRoute] || headerMap.home;
            },

            getPasswordStrengthText: function () {
                if (this.passwordStrength === 'strong') {
                    return '强';
                }

                if (this.passwordStrength === 'medium') {
                    return '中';
                }

                if (this.passwordStrength === 'weak') {
                    return '弱';
                }

                return '';
            },

            getPasswordStrengthIcon: function () {
                if (this.passwordStrength === 'strong') {
                    return 'fas fa-shield-halved';
                }

                if (this.passwordStrength === 'medium') {
                    return 'fas fa-shield';
                }

                if (this.passwordStrength === 'weak') {
                    return 'fas fa-triangle-exclamation';
                }

                return 'fas fa-circle';
            },

            formattedRegistrationDate: function () {
                return formatDate(this.registrationDate, true);
            },

            formattedLastUsed: function () {
                return formatRelativeTime(this.lastUsed);
            },

            homeRecentRecords: function () {
                return this.recentRecords.slice(0, 4);
            },

            filteredHistoryRecords: function () {
                var self = this;

                if (this.dataMode === 'real') {
                    return this.historyRecords;
                }

                return this.historyRecords.filter(function (record) {
                    var searchValue = (self.historyFilters.search || '').toLowerCase();
                    var recordCamera = (record.camera || '').toLowerCase();
                    var recordLocation = (record.location || '').toLowerCase();
                    var recordId = (record.id || '').toLowerCase();
                    var matchesSearch = !searchValue
                        || recordId.indexOf(searchValue) !== -1
                        || recordCamera.indexOf(searchValue) !== -1
                        || recordLocation.indexOf(searchValue) !== -1;
                    var matchesCamera = self.historyFilters.camera === '全部' || record.camera === self.historyFilters.camera;
                    var matchesLocation = self.historyFilters.location === '全部' || record.location === self.historyFilters.location;
                    var matchesStatus = self.historyFilters.status === '全部' || record.status === self.historyFilters.status;

                    return matchesSearch && matchesCamera && matchesLocation && matchesStatus;
                });
            },

            statisticsTrendBars: function () {
                var detectionMax = 1;
                var reidMax = 1;
                var index;

                for (index = 0; index < this.statisticsTrend.length; index += 1) {
                    detectionMax = Math.max(detectionMax, Number(this.statisticsTrend[index].detections || 0));
                    reidMax = Math.max(reidMax, Number(this.statisticsTrend[index].reid || 0));
                }

                return this.statisticsTrend.map(function (item) {
                    return {
                        label: item.label,
                        detectionHeight: Math.max(18, Math.round((Number(item.detections || 0) / detectionMax) * 100)) + '%',
                        reidHeight: Math.max(14, Math.round((Number(item.reid || 0) / reidMax) * 82)) + '%'
                    };
                });
            },

            previewBadgeText: function () {
                if (this.dataMode === 'real') {
                    return '平台运行';
                }

                return '系统在线';
            },

            isRealMode: function () {
                return this.dataMode === 'real';
            },

            selectedReidSource: function () {
                var sourceOptions = this.reidState.sourceOptions || [];
                var index;

                for (index = 0; index < sourceOptions.length; index += 1) {
                    if (sourceOptions[index].value === this.reidState.selectedSourceType) {
                        return sourceOptions[index];
                    }
                }

                return sourceOptions[0] || {
                    value: 'localVideo',
                    label: '视频库',
                    description: ''
                };
            },

            reidTaskStatus: function () {
                return reidTaskStatusMeta(((this.reidState || {}).queryTask || {}).status);
            },

            reidElapsedText: function () {
                return formatDuration((((this.reidState || {}).queryTask || {}).elapsedMs) || 0);
            },

            reidSelectedResult: function () {
                var results = (this.reidState || {}).results || [];
                var index;

                if (results.length === 0) {
                    return null;
                }

                for (index = 0; index < results.length; index += 1) {
                    if (results[index].id === this.reidState.selectedResultId) {
                        return results[index];
                    }
                }

                return results[0];
            },

            reidCanStart: function () {
                return !!(((this.reidState || {}).queryImage || {}).url) && !this.reidState.isProcessing;
            },

            reidHasQueryImage: function () {
                return !!(((this.reidState || {}).queryImage || {}).url);
            },

            monitoringHeatmapMap: function () {
                if (PLATFORM_INSIGHTS.buildMonitoringHeatmap) {
                    return PLATFORM_INSIGHTS.buildMonitoringHeatmap(this.monitoringHeatmapZones);
                }

                return [];
            },

            selectedMonitoringZone: function () {
                var zones = this.monitoringHeatmapMap;
                var index;

                for (index = 0; index < zones.length; index += 1) {
                    if (zones[index].name === this.selectedMonitoringZoneName) {
                        return zones[index];
                    }
                }

                return zones[0] || null;
            },

            monitoringTimelineModel: function () {
                if (PLATFORM_INSIGHTS.buildMonitoringTimeline) {
                    return PLATFORM_INSIGHTS.buildMonitoringTimeline(
                        this.monitoringTimeline,
                        this.selectedMonitoringTimelineIndex
                    );
                }

                return {
                    points: [],
                    selected: null
                };
            },

            statisticsInsights: function () {
                if (PLATFORM_INSIGHTS.buildStatisticsInsights) {
                    return PLATFORM_INSIGHTS.buildStatisticsInsights(
                        {
                            zones: this.statisticsZones,
                            trend: this.statisticsTrend,
                            capacity: this.statisticsCapacity
                        },
                        {
                            summary: this.monitoringSummary
                        }
                    );
                }

                return [];
            },

            statisticsRecommendations: function () {
                if (PLATFORM_INSIGHTS.buildStatisticsRecommendations) {
                    return PLATFORM_INSIGHTS.buildStatisticsRecommendations(
                        {
                            zones: this.statisticsZones,
                            trend: this.statisticsTrend,
                            capacity: this.statisticsCapacity
                        },
                        {
                            summary: this.monitoringSummary
                        }
                    );
                }

                return [];
            },

            reidTrajectoryMap: function () {
                if (!PLATFORM_INSIGHTS.buildTrajectoryMap) {
                    return {
                        regions: [],
                        nodes: [],
                        pathData: ''
                    };
                }

                return PLATFORM_INSIGHTS.buildTrajectoryMap(this.reidState.trajectory || []);
            },

            reidSelectedResultNarrative: function () {
                if (PLATFORM_INSIGHTS.buildResultNarrative) {
                    return PLATFORM_INSIGHTS.buildResultNarrative(this.reidSelectedResult);
                }

                return '';
            },

            selectedRecordTrajectory: function () {
                if (!this.selectedRecord) {
                    return [];
                }

                if (PLATFORM_INSIGHTS.buildHistoryTrajectory) {
                    return PLATFORM_INSIGHTS.buildHistoryTrajectory(this.selectedRecord, MOCK);
                }

                return this.selectedRecord.trajectory || [];
            },

            selectedRecordParamsSummary: function () {
                return this.getRecordParamsSummary(this.selectedRecord);
            }
        },
        methods: {
            formatDate: formatDate,
            formatFileSize: formatFileSize,
            formatRelativeTime: formatRelativeTime,
            formatDuration: formatDuration,

            ensureSettingsShape: function () {
                var normalized = normalizeSettings(this.settings);

                if (JSON.stringify(normalized) !== JSON.stringify(this.settings)) {
                    this.settings = normalized;
                }
            },

            switchToLogin: function () {
                this.currentAuthForm = 'login';
            },

            syncRouteFromHash: function () {
                this.currentRoute = parseHashRoute();
            },

            navigate: function (route) {
                this.currentRoute = route;
                window.location.hash = '#/' + route;

                if (route === 'reid') {
                    this.syncReidDefaultsFromSettings(false);
                }
            },

            isValidEmailAddress: function (email) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
            },

            clearCodeCooldown: function (scene) {
                var timerKey = scene === 'register' ? 'registerCodeTimer' : 'resetCodeTimer';
                var cooldownKey = scene === 'register' ? 'registerCodeCooldown' : 'resetCodeCooldown';

                if (this[timerKey]) {
                    clearInterval(this[timerKey]);
                    this[timerKey] = null;
                }

                this[cooldownKey] = 0;
            },

            startCodeCooldown: function (scene, seconds) {
                var self = this;
                var timerKey = scene === 'register' ? 'registerCodeTimer' : 'resetCodeTimer';
                var cooldownKey = scene === 'register' ? 'registerCodeCooldown' : 'resetCodeCooldown';

                self.clearCodeCooldown(scene);
                self[cooldownKey] = Number(seconds) || 0;

                if (self[cooldownKey] <= 0) {
                    return;
                }

                self[timerKey] = setInterval(function () {
                    if (self[cooldownKey] <= 1) {
                        self.clearCodeCooldown(scene);
                        return;
                    }

                    self[cooldownKey] -= 1;
                }, 1000);
            },

            queueToast: function (message, type) {
                var self = this;
                var iconMap = {
                    success: 'fas fa-circle-check',
                    info: 'fas fa-circle-info',
                    warning: 'fas fa-triangle-exclamation',
                    error: 'fas fa-circle-exclamation'
                };
                var toast = {
                    id: 'toast-' + (self.toastSeed += 1),
                    type: type || 'info',
                    icon: iconMap[type || 'info'] || iconMap.info,
                    message: message
                };

                self.toasts.push(toast);

                setTimeout(function () {
                    self.toasts = self.toasts.filter(function (item) {
                        return item.id !== toast.id;
                    });
                }, 3200);
            },

            persistSession: function () {
                localStorage.setItem(SESSION_KEY, JSON.stringify({
                    currentUser: this.currentUser,
                    currentUserEmail: this.currentUserEmail,
                    authToken: this.authToken,
                    usageCount: this.usageCount,
                    lastUsed: this.lastUsed,
                    registrationDate: this.registrationDate
                }));
            },

            clearSession: function () {
                localStorage.removeItem(SESSION_KEY);
            },

            restoreSession: function () {
                var savedSession = localStorage.getItem(SESSION_KEY);
                var parsed;

                if (!savedSession) {
                    return;
                }

                try {
                    parsed = JSON.parse(savedSession);
                    if (!parsed.authToken) {
                        this.clearSession();
                        return;
                    }

                    this.isLoggedIn = true;
                    this.authToken = parsed.authToken || '';
                    this.currentUser = parsed.currentUser || (MOCK.user || {}).username || '景区值守员';
                    this.currentUserEmail = parsed.currentUserEmail || (MOCK.user || {}).email || '';
                    this.usageCount = Number(parsed.usageCount || 0);
                    this.lastUsed = parsed.lastUsed || '';
                    this.registrationDate = parsed.registrationDate || '';
                } catch (error) {
                    console.error('恢复会话失败:', error);
                    this.clearSession();
                }
            },

            restoreSettings: function () {
                var savedSettings = localStorage.getItem(SETTINGS_KEY);
                var parsed;

                if (!savedSettings) {
                    return;
                }

                try {
                    parsed = JSON.parse(savedSettings);
                    this.settings = normalizeSettings(parsed);
                } catch (error) {
                    console.error('恢复设置失败:', error);
                }
            },

            applyMockUser: function (usernameOrEmail, previewMode) {
                var baseUser = deepClone(previewMode ? (MOCK.previewUser || {}) : (MOCK.user || {}));
                var inputValue = (usernameOrEmail || '').trim();
                var looksLikeEmail = inputValue.indexOf('@') !== -1;

                this.currentUser = baseUser.username
                    || (looksLikeEmail ? '系统管理员' : (inputValue || '景区值守员'));
                this.currentUserEmail = baseUser.email
                    || (looksLikeEmail ? inputValue : 'admin@jingqu.local');
                this.usageCount = Number(baseUser.usageCount || 0);
                this.lastUsed = baseUser.lastUsed || new Date().toISOString();
                this.registrationDate = baseUser.registrationDate || new Date().toISOString();
            },

            enterPreviewMode: function (showToast) {
                var self = this;
                this.isPreviewMode = true;
                this.isLoggedIn = true;
                this.currentAuthForm = 'login';
                this.applyMockUser('preview@local.test', true);
                this.persistSession();

                if (showToast) {
                    this.queueToast('已进入平台，可直接查看系统页面。', 'info');
                }

                if (this.isRealMode) {
                    this.$nextTick(function () {
                        self.loadRecentRecords({ pageSize: 6 });
                    });
                }
            },

            buildApiContext: function () {
                return {
                    authToken: this.authToken,
                    previewUserEmail: this.currentUserEmail || 'admin@jingqu.local',
                    previewUsername: this.currentUser || '系统管理员'
                };
            },

            getResultMatchImageUrl: function (result) {
                if (result && result.matchImageUrl) {
                    return result.matchImageUrl;
                }

                return this.getMockCropUrl(result && result.matchImage);
            },

            getFrameImageUrl: function (frame) {
                if (frame && frame.imageUrl) {
                    return frame.imageUrl;
                }

                return this.getMockCropUrl(frame && frame.image);
            },

            getFrameTimestampText: function (frame) {
                var timestamp = frame && frame.timestamp;

                if (!timestamp) {
                    return '--:--';
                }

                return String(timestamp).indexOf('T') !== -1
                    ? this.formatDate(timestamp, true)
                    : timestamp;
            },

            resolveRealQueryImageFile: async function () {
                var queryImage = this.reidState.queryImage || {};
                var response;
                var blob;

                if (queryImage.rawFile) {
                    return queryImage.rawFile;
                }

                if (!queryImage.url) {
                    throw new Error('请先上传查询图');
                }

                response = await fetch(queryImage.url);
                if (!response.ok) {
                    throw new Error('查询图片读取失败，无法提交识别请求');
                }

                blob = await response.blob();
                return new File(
                    [blob],
                    queryImage.fileName || queryImage.name || 'query-image.jpg',
                    {
                        type: blob.type || 'image/jpeg'
                    }
                );
            },

            scheduleHistoryFetch: function () {
                var self = this;

                if (self.historyFetchTimer) {
                    clearTimeout(self.historyFetchTimer);
                    self.historyFetchTimer = null;
                }

                self.historyFetchTimer = setTimeout(function () {
                    self.loadHistoryRecords();
                }, 260);
            },

            loadRecentRecords: async function (options) {
                var response;

                if (!this.isRealMode || !this.isLoggedIn) {
                    return;
                }

                this.recentRecordsLoading = true;
                this.recentRecordsError = '';

                try {
                    response = await REID_API.fetchHistoryList({
                        baseUrl: this.apiBaseUrl,
                        page: 1,
                        pageSize: (options && options.pageSize) || 4,
                        context: this.buildApiContext()
                    });
                    this.recentRecords = response.records.slice(0, 6);
                } catch (error) {
                    this.recentRecordsError = error.message || '最近记录加载失败';
                    this.queueToast(this.recentRecordsError, 'warning');
                } finally {
                    this.recentRecordsLoading = false;
                }
            },

            loadHistoryRecords: async function () {
                var response;

                if (!this.isRealMode || !this.isLoggedIn) {
                    return;
                }

                this.historyLoading = true;
                this.historyError = '';

                try {
                    response = await REID_API.fetchHistoryList({
                        baseUrl: this.apiBaseUrl,
                        page: this.historyPagination.page,
                        pageSize: this.historyPagination.pageSize,
                        keyword: this.historyFilters.search,
                        status: this.historyFilters.status === '全部' ? '' : this.historyFilters.status,
                        camera: this.historyFilters.camera === '全部' ? '' : this.historyFilters.camera,
                        location: this.historyFilters.location === '全部' ? '' : this.historyFilters.location,
                        context: this.buildApiContext()
                    });
                    this.historyRecords = response.records;
                    this.historyPagination = response.pagination;
                } catch (error) {
                    this.historyError = error.message || '历史记录加载失败';
                    this.historyRecords = [];
                    this.queueToast(this.historyError, 'warning');
                } finally {
                    this.historyLoading = false;
                }
            },

            refreshRealLinkedRecords: async function () {
                if (!this.isRealMode) {
                    return;
                }

                await this.loadRecentRecords({ pageSize: 6 });

                if (this.currentRoute === 'history') {
                    await this.loadHistoryRecords();
                }
            },

            resetLoginForm: function () {
                this.loginForm.username = '';
                this.loginForm.password = '';
                this.loginErrors.username = false;
                this.loginErrors.password = false;
                this.showLoginPassword = false;
            },

            resetRegisterForm: function () {
                this.registerForm = {
                    username: '',
                    email: '',
                    emailCode: '',
                    password: '',
                    confirmPassword: ''
                };
                this.registerErrors = {
                    username: false,
                    email: false,
                    emailCode: false,
                    password: false,
                    confirmPassword: false
                };
                this.passwordStrength = '';
                this.registerCodeMessage = '';
                this.showRegisterPassword = false;
                this.showConfirmPassword = false;
                this.clearCodeCooldown('register');
            },

            resetResetForm: function () {
                this.resetForm = {
                    email: '',
                    emailCode: '',
                    newPassword: '',
                    confirmPassword: ''
                };
                this.resetErrors = {
                    email: false,
                    emailCode: false,
                    newPassword: false,
                    confirmPassword: false
                };
                this.resetCodeMessage = '';
                this.clearCodeCooldown('reset');
            },

            login: function () {
                var self = this;
                var payload;

                self.loginErrors.username = !self.loginForm.username.trim();
                self.loginErrors.password = !self.loginForm.password || self.loginForm.password.length < 6;

                if (self.loginErrors.username || self.loginErrors.password) {
                    return;
                }

                self.authLoading = true;

                API_CLIENT.request({
                    baseUrl: self.apiBaseUrl,
                    path: '/api/login',
                    method: 'POST',
                    body: JSON.stringify({
                        username: self.loginForm.username.trim(),
                        password: self.loginForm.password
                    })
                }).then(function (response) {
                    payload = response || {};
                    self.authToken = payload.token || '';
                    self.isLoggedIn = true;
                    self.isPreviewMode = false;
                    self.loginSuccess = true;
                    self.currentUser = (((payload.user || {}).username) || self.loginForm.username.trim());
                    self.currentUserEmail = (((payload.user || {}).email) || '');
                    self.usageCount = Number((((payload.user || {}).usageCount) || 0));
                    self.lastUsed = (((payload.user || {}).lastUsed) || '');
                    self.registrationDate = (((payload.user || {}).registrationDate) || '');

                    if (payload.user && payload.user.settings) {
                        self.settings = normalizeSettings(payload.user.settings);
                    }

                    if (self.loginForm.remember) {
                        self.persistSession();
                    } else {
                        self.clearSession();
                    }

                    self.queueToast(
                        self.isRealMode
                            ? '登录成功，识别任务与历史记录已连接系统服务。'
                            : '登录成功。',
                        'success'
                    );

                    if (self.isRealMode) {
                        self.loadRecentRecords({ pageSize: 6 });
                    }

                    setTimeout(function () {
                        self.loginSuccess = false;
                        self.resetLoginForm();
                    }, 600);
                }).catch(function (error) {
                    self.queueToast(error.message || '登录失败', 'error');
                }).finally(function () {
                    self.authLoading = false;
                });
            },

            sendRegisterCode: function () {
                var self = this;
                var email = self.registerForm.email.trim();

                self.registerErrors.email = false;
                self.registerCodeMessage = '';

                if (!self.isValidEmailAddress(email)) {
                    self.registerErrors.email = true;
                    return;
                }

                self.registerCodeLoading = true;

                API_CLIENT.request({
                    baseUrl: self.apiBaseUrl,
                    path: '/api/register/email-code/send',
                    method: 'POST',
                    body: JSON.stringify({
                        email: email
                    })
                }).then(function (response) {
                    var retryAfterSec = Number((response || {}).retryAfterSec || 60);
                    self.registerCodeLoading = false;
                    self.registerCodeMessage = (response && response.msg) || '验证码已发送，请查收邮箱';
                    self.startCodeCooldown('register', retryAfterSec);
                    self.queueToast((response && response.msg) || '验证码已发送，请查收邮箱。', 'info');
                }).catch(function (error) {
                    self.registerCodeLoading = false;
                    self.queueToast(error.message || '验证码发送失败', 'error');
                });
            },

            sendResetCode: function () {
                var self = this;
                var email = self.resetForm.email.trim();

                self.resetErrors.email = false;
                self.resetCodeMessage = '';

                if (!self.isValidEmailAddress(email)) {
                    self.resetErrors.email = true;
                    return;
                }

                self.resetCodeLoading = true;

                API_CLIENT.request({
                    baseUrl: self.apiBaseUrl,
                    path: '/api/reset-password/email-code/send',
                    method: 'POST',
                    body: JSON.stringify({
                        email: email
                    })
                }).then(function (response) {
                    var retryAfterSec = Number((response || {}).retryAfterSec || 60);
                    self.resetCodeLoading = false;
                    self.resetCodeMessage = (response && response.msg) || '验证码已发送，请查收邮箱';
                    self.startCodeCooldown('reset', retryAfterSec);
                    self.queueToast((response && response.msg) || '验证码已发送，请查收邮箱。', 'info');
                }).catch(function (error) {
                    self.resetCodeLoading = false;
                    self.queueToast(error.message || '验证码发送失败', 'error');
                });
            },

            checkPasswordStrength: function () {
                var password = this.registerForm.password || '';
                var strength = 0;

                if (!password) {
                    this.passwordStrength = '';
                    return;
                }

                if (password.length >= 6) {
                    strength += 1;
                }

                if (password.length >= 9) {
                    strength += 1;
                }

                if (/[A-Z]/.test(password)) {
                    strength += 1;
                }

                if (/\d/.test(password)) {
                    strength += 1;
                }

                if (/[^a-zA-Z\d]/.test(password)) {
                    strength += 1;
                }

                if (strength >= 4) {
                    this.passwordStrength = 'strong';
                } else if (strength >= 2) {
                    this.passwordStrength = 'medium';
                } else {
                    this.passwordStrength = 'weak';
                }
            },

            validateRegisterForm: function () {
                this.registerErrors = {
                    username: !this.registerForm.username.trim() || this.registerForm.username.trim().length < 3,
                    email: !this.isValidEmailAddress(this.registerForm.email),
                    emailCode: !/^\d{6}$/.test(this.registerForm.emailCode.trim()),
                    password: !this.registerForm.password || this.registerForm.password.length < 6,
                    confirmPassword: this.registerForm.password !== this.registerForm.confirmPassword
                };

                return !this.registerErrors.username
                    && !this.registerErrors.email
                    && !this.registerErrors.emailCode
                    && !this.registerErrors.password
                    && !this.registerErrors.confirmPassword;
            },

            register: function () {
                var self = this;

                if (!self.validateRegisterForm()) {
                    return;
                }

                self.authLoading = true;

                API_CLIENT.request({
                    baseUrl: self.apiBaseUrl,
                    path: '/api/register',
                    method: 'POST',
                    body: JSON.stringify({
                        username: self.registerForm.username.trim(),
                        email: self.registerForm.email.trim(),
                        emailCode: self.registerForm.emailCode.trim(),
                        password: self.registerForm.password
                    })
                }).then(function (response) {
                    self.authLoading = false;
                    self.queueToast((response && response.msg) || '账号注册成功，请使用当前信息登录平台。', 'success');
                    self.resetRegisterForm();
                    self.currentAuthForm = 'login';
                }).catch(function (error) {
                    self.authLoading = false;
                    self.queueToast(error.message || '账号注册失败', 'error');
                });
            },

            validateResetForm: function () {
                this.resetErrors = {
                    email: !this.isValidEmailAddress(this.resetForm.email),
                    emailCode: !/^\d{6}$/.test(this.resetForm.emailCode.trim()),
                    newPassword: !this.resetForm.newPassword || this.resetForm.newPassword.length < 6,
                    confirmPassword: this.resetForm.newPassword !== this.resetForm.confirmPassword
                };

                return !this.resetErrors.email
                    && !this.resetErrors.emailCode
                    && !this.resetErrors.newPassword
                    && !this.resetErrors.confirmPassword;
            },

            resetPassword: function () {
                var self = this;

                if (!self.validateResetForm()) {
                    return;
                }

                self.authLoading = true;

                API_CLIENT.request({
                    baseUrl: self.apiBaseUrl,
                    path: '/api/reset-password',
                    method: 'POST',
                    body: JSON.stringify({
                        email: self.resetForm.email.trim(),
                        emailCode: self.resetForm.emailCode.trim(),
                        newPassword: self.resetForm.newPassword
                    })
                }).then(function (response) {
                    self.authLoading = false;
                    self.queueToast((response && response.msg) || '密码已重置，请返回登录页继续使用。', 'success');
                    self.resetResetForm();
                    self.currentAuthForm = 'login';
                }).catch(function (error) {
                    self.authLoading = false;
                    self.queueToast(error.message || '密码重置失败', 'error');
                });
            },

            logout: function () {
                this.queueToast('已退出平台。', 'info');
                this.isLoggedIn = false;
                this.isPreviewMode = false;
                this.authToken = '';
                this.clearSession();
                this.currentUser = '';
                this.currentUserEmail = '';
                this.currentAuthForm = 'login';
                this.currentRoute = 'home';
                this.resetLoginForm();
                this.resetRegisterForm();
                this.resetResetForm();
                this.clearReidWorkspace();
                window.location.hash = '#/home';
            },

            handleHeroAction: function (actionKey) {
                if (actionKey === 'go-monitoring') {
                    this.navigate('monitoring');
                    return;
                }

                if (actionKey === 'go-reid') {
                    this.navigate('reid');
                    return;
                }

                if (actionKey === 'refresh-monitoring') {
                    this.queueToast('实时监测视图已刷新。', 'success');
                    return;
                }

                if (actionKey === 'refresh-statistics') {
                    this.queueToast('统计数据视图已刷新。', 'success');
                    return;
                }

                if (actionKey === 'load-sample-query') {
                    this.loadSampleQuery();
                    return;
                }

                if (actionKey === 'run-sample-reid') {
                    this.runSampleReid();
                    return;
                }

                if (actionKey === 'reset-history-filters') {
                    this.historyFilters = {
                        search: '',
                        camera: '全部',
                        location: '全部',
                        status: '全部'
                    };
                    this.queueToast('历史记录筛选条件已重置。', 'info');
                    return;
                }

                if (actionKey === 'reset-reid-params') {
                    this.resetReidParams();
                    return;
                }

                if (actionKey === 'save-settings') {
                    this.saveSettings();
                    return;
                }

                if (actionKey === 'restore-default-settings') {
                    this.restoreDefaultSettings();
                    return;
                }
            },

            syncReidDefaultsFromSettings: function (applyCurrentParams) {
                var defaults = REID_WORKBENCH.buildDefaultParams
                    ? REID_WORKBENCH.buildDefaultParams(MOCK, this.settings)
                    : {
                        confThreshold: this.settings.defaults.confidence,
                        iouThreshold: this.settings.defaults.iou,
                        similarityThreshold: this.settings.defaults.similarity,
                        topK: this.settings.defaults.topK,
                        autoSaveResult: this.settings.autoSave,
                        defaultSource: this.settings.defaults.sourceType
                    };

                this.reidState.defaultParams = defaults;

                if (applyCurrentParams || this.reidState.queryTask.status === 'idle') {
                    this.reidState.params = {
                        confThreshold: defaults.confThreshold,
                        iouThreshold: defaults.iouThreshold,
                        similarityThreshold: defaults.similarityThreshold,
                        topK: defaults.topK,
                        autoSaveResult: defaults.autoSaveResult
                    };
                    this.reidState.selectedSourceType = defaults.defaultSource;
                    this.reidState.queryTask.sourceType = defaults.defaultSource;
                    this.reidState.queryTask.sourceName = this.getSourceLabel(defaults.defaultSource);
                }
            },

            triggerFileInput: function () {
                if (this.$refs.fileInput) {
                    this.$refs.fileInput.click();
                }
            },

            handleFileSelect: function (event) {
                var file = event.target.files[0];
                this.loadUploadedFile(file);
            },

            handleDrop: function (event) {
                event.preventDefault();
                this.loadUploadedFile(event.dataTransfer.files[0]);
            },

            updateQueryImage: function (payload) {
                this.reidState.queryImage = {
                    name: payload.name || '',
                    url: payload.url || '',
                    sizeBytes: Number(payload.sizeBytes || 0),
                    sizeText: payload.sizeText || formatFileSize(payload.sizeBytes),
                    width: Number(payload.width || 0),
                    height: Number(payload.height || 0),
                    uploadedAt: payload.uploadedAt || new Date().toISOString(),
                    fileName: payload.fileName || '',
                    source: payload.source || 'upload',
                    rawFile: payload.rawFile || null
                };
                this.reidState.queryTask.status = 'uploaded';
                this.reidState.queryTask.queryImage = this.reidState.queryImage.name;
                this.reidState.queryTask.sourceType = this.reidState.selectedSourceType;
                this.reidState.queryTask.sourceName = this.selectedReidSource.label;
                this.reidState.logs = [
                    {
                        time: new Date().toISOString(),
                        level: 'info',
                        message: '查询图已加载，工作台已准备就绪。'
                    }
                ];
                this.reidState.results = [];
                this.reidState.selectedResultId = '';
                this.reidState.trajectory = [];
                this.reidState.progress = {
                    progress: 0,
                    detectedCandidates: 0,
                    matchedCandidates: 0,
                    finishedResults: 0
                };
                this.reidState.currentFrame = deepClone(((MOCK.reid || {}).idleFrame) || this.reidState.currentFrame);
                this.reidState.resultVideo = deepClone(((MOCK.reid || {}).resultVideo) || this.reidState.resultVideo);
            },

            loadUploadedFile: function (file) {
                var self = this;
                var reader;
                var imageProbe;

                if (!file) {
                    return;
                }

                if (!file.type || file.type.indexOf('image/') !== 0) {
                    self.queueToast('请上传图片文件。', 'warning');
                    return;
                }

                if (file.size > 5 * 1024 * 1024) {
                    self.queueToast('图片大小不能超过 5MB。', 'warning');
                    return;
                }

                reader = new FileReader();
                reader.onload = function (loadEvent) {
                    imageProbe = new Image();
                    imageProbe.onload = function () {
                        self.updateQueryImage({
                            name: file.name,
                            url: loadEvent.target.result,
                            sizeBytes: file.size,
                            sizeText: formatFileSize(file.size),
                            width: imageProbe.naturalWidth,
                            height: imageProbe.naturalHeight,
                            uploadedAt: new Date().toISOString(),
                            fileName: file.name,
                            source: 'upload',
                            rawFile: file
                        });
                        self.queueToast('查询图已加载，可以开始行人重识别。', 'info');
                    };
                    imageProbe.onerror = function () {
                        self.updateQueryImage({
                            name: file.name,
                            url: loadEvent.target.result,
                            sizeBytes: file.size,
                            sizeText: formatFileSize(file.size),
                            width: 0,
                            height: 0,
                            uploadedAt: new Date().toISOString(),
                            fileName: file.name,
                            source: 'upload',
                            rawFile: file
                        });
                        self.queueToast('查询图已加载，但未能识别尺寸信息。', 'warning');
                    };
                    imageProbe.src = loadEvent.target.result;
                };
                reader.onerror = function () {
                    self.queueToast('图片读取失败，请重试。', 'error');
                };
                reader.readAsDataURL(file);
            },

            loadSampleQuery: function () {
                var sample = (MOCK.reid || {}).sampleQuery || {};

                if (!sample.filename) {
                    this.queueToast('当前未配置查询图片。', 'warning');
                    return;
                }

                this.updateQueryImage({
                    name: sample.name || sample.filename,
                    url: this.getMockCropUrl(sample.filename),
                    sizeBytes: sample.sizeBytes || 0,
                    sizeText: formatFileSize(sample.sizeBytes || 0),
                    width: sample.width || 0,
                    height: sample.height || 0,
                    uploadedAt: new Date().toISOString(),
                    fileName: sample.filename,
                    source: 'sample',
                    rawFile: null
                });
                this.queueToast('已载入查询图片。', 'success');
            },

            runSampleReid: function () {
                if (!this.reidHasQueryImage) {
                    this.loadSampleQuery();
                }

                this.$nextTick(function () {
                    this.startReidTask();
                });
            },

            stopReidTimers: function () {
                if (this.reidProgressTimer) {
                    clearTimeout(this.reidProgressTimer);
                    this.reidProgressTimer = null;
                }

                if (this.reidElapsedTimer) {
                    clearInterval(this.reidElapsedTimer);
                    this.reidElapsedTimer = null;
                }
            },

            pushReidLog: function (level, message, time) {
                var logEntry = {
                    time: time || new Date().toISOString(),
                    level: level || 'info',
                    message: message
                };

                this.reidState.logs.push(logEntry);
                this.reidState.logs = this.reidState.logs.slice(-30);

                this.$nextTick(function () {
                    if (this.$refs.reidLogContainer) {
                        this.$refs.reidLogContainer.scrollTop = this.$refs.reidLogContainer.scrollHeight;
                    }
                });
            },

            clearReidWorkspace: function () {
                var newState = createInitialReidState(this.settings);
                newState.logs = [
                    {
                        time: new Date().toISOString(),
                        level: 'info',
                        message: '工作台已清空，等待重新导入查询图。'
                    }
                ];

                this.stopReidTimers();
                this.reidState = newState;

                if (this.$refs.fileInput) {
                    this.$refs.fileInput.value = '';
                }
            },

            resetReidParams: function () {
                this.syncReidDefaultsFromSettings(true);
                this.queueToast('行人重识别参数已恢复默认值。', 'success');
            },

            restoreDefaultSettings: function () {
                this.settings = createDefaultSettings();
                this.syncReidDefaultsFromSettings(true);
                this.queueToast('设置已恢复为平台默认值。', 'success');
            },

            handleSourceChange: function () {
                this.reidState.queryTask.sourceType = this.reidState.selectedSourceType;
                this.reidState.queryTask.sourceName = this.selectedReidSource.label;
            },

            selectMonitoringZone: function (zoneName) {
                this.selectedMonitoringZoneName = zoneName;
            },

            selectMonitoringTimeline: function (index) {
                this.selectedMonitoringTimelineIndex = index;
            },

            applyReidApiResponse: function (response) {
                var results = response.results || [];
                var topResult = results[0] || null;

                this.reidState.isProcessing = false;
                this.reidState.queryTask.id = response.taskId || this.reidState.queryTask.id;
                this.reidState.queryTask.status = results.length > 0 ? 'completed' : 'empty';
                this.reidState.queryTask.startedAt = this.reidState.queryTask.startedAt || new Date().toISOString();
                this.reidState.queryTask.elapsedMs = Date.now() - new Date(this.reidState.queryTask.startedAt).getTime();
                this.reidState.progress = {
                    progress: 100,
                    detectedCandidates: Number(((response.summary || {}).detectedCandidates) || 0),
                    matchedCandidates: Number(((response.summary || {}).matchedCandidates) || 0),
                    finishedResults: Number(((response.summary || {}).finishedResults) || results.length)
                };
                this.reidState.results = results;
                this.reidState.selectedResultId = topResult ? topResult.id : '';
                this.reidState.trajectory = topResult
                    ? (topResult.trajectory || [])
                    : (response.trajectory || []);
                this.reidState.resultVideo = topResult && topResult.resultClip
                    ? topResult.resultClip
                    : this.reidState.resultVideo;
                this.reidState.currentFrame = topResult && topResult.currentFrame
                    ? topResult.currentFrame
                    : this.reidState.currentFrame;

                if (response.usage) {
                    this.usageCount = Number(response.usage.usageCount || this.usageCount);
                    this.lastUsed = response.usage.lastUsed || new Date().toISOString();
                } else {
                    this.lastUsed = new Date().toISOString();
                }

                this.persistSession();
            },

            startReidTaskReal: async function () {
                var queryFile;
                var response;

                if (!this.reidCanStart) {
                    this.queueToast('请先上传查询图。', 'warning');
                    return;
                }

                this.stopReidTimers();
                this.reidState.isProcessing = true;
                this.reidState.queryTask = {
                    id: '',
                    queryImage: this.reidState.queryImage.name || '',
                    sourceType: this.reidState.selectedSourceType,
                    sourceName: this.selectedReidSource.label,
                    status: 'submitting',
                    startedAt: new Date().toISOString(),
                    elapsedMs: 0
                };
                this.reidState.progress = {
                    progress: 8,
                    detectedCandidates: 0,
                    matchedCandidates: 0,
                    finishedResults: 0
                };
                this.reidState.results = [];
                this.reidState.selectedResultId = '';
                this.reidState.trajectory = [];
                this.reidState.currentFrame = {
                    title: '真实请求提交中',
                    caption: '等待后端返回识别结果',
                    image: '',
                    imageUrl: '',
                    timestamp: new Date().toISOString()
                };
                this.reidState.resultVideo = {
                    title: '结果视频区',
                    clipName: '等待结果片段',
                    description: '识别完成后将在此展示关联视频信息。',
                    duration: '--:--'
                };
                this.reidState.logs = [];
                this.pushReidLog('info', '已准备提交识别请求。');
                this.pushReidLog('info', '正在上传查询图并等待后端处理。');

                try {
                    queryFile = await this.resolveRealQueryImageFile();
                    this.reidState.progress.progress = 32;
                    response = await REID_API.search({
                        baseUrl: this.apiBaseUrl,
                        timeoutMs: 120000,
                        context: this.buildApiContext(),
                        queryImageFile: queryFile,
                        sourceType: this.reidState.selectedSourceType,
                        confThreshold: this.reidState.params.confThreshold,
                        iouThreshold: this.reidState.params.iouThreshold,
                        similarityThreshold: this.reidState.params.similarityThreshold,
                        topK: this.reidState.params.topK,
                        autoSaveResult: this.reidState.params.autoSaveResult
                    });
                    this.pushReidLog('success', '已收到识别结果。');
                    this.applyReidApiResponse(response);

                    if (response.results.length === 0) {
                        this.pushReidLog('warning', '当前请求未返回匹配结果。');
                        this.queueToast(response.message || '未找到匹配结果。', 'warning');
                        await this.refreshRealLinkedRecords();
                        return;
                    }

                    if (response.savedRecord) {
                        this.recentRecords.unshift(response.savedRecord);
                        this.recentRecords = this.recentRecords.slice(0, 6);
                    }

                    this.queueToast(response.message || '识别任务已完成。', 'success');
                    await this.refreshRealLinkedRecords();
                } catch (error) {
                    this.reidState.isProcessing = false;
                    this.reidState.queryTask.status = error.code === 'TIMEOUT' ? 'timeout' : 'failed';
                    this.reidState.progress.progress = 0;
                    this.pushReidLog('error', '请求失败：' + (error.message || '未知错误'));
                    this.queueToast(error.message || '识别请求失败', 'error');
                }
            },

            startReidTask: function () {
                if (this.isRealMode) {
                    this.startReidTaskReal();
                    return;
                }

                var self = this;
                var bundle;
                var stepIndex = 0;

                if (!self.reidCanStart) {
                    self.queueToast('请先上传查询图。', 'warning');
                    return;
                }

                self.stopReidTimers();
                self.reidState.isProcessing = true;
                self.reidState.params.autoSaveResult = !!self.reidState.params.autoSaveResult;
                bundle = REID_WORKBENCH.buildRunBundle
                    ? REID_WORKBENCH.buildRunBundle(MOCK, {
                        sourceType: self.reidState.selectedSourceType,
                        params: self.reidState.params,
                        queryImage: self.reidState.queryImage
                    })
                    : null;

                if (!bundle) {
                    self.queueToast('重识别工作台尚未完成初始化。', 'error');
                    self.reidState.isProcessing = false;
                    return;
                }

                self.reidState.queryTask = bundle.task;
                self.reidState.progress = {
                    progress: 0,
                    detectedCandidates: 0,
                    matchedCandidates: 0,
                    finishedResults: 0
                };
                self.reidState.logs = [];
                self.reidState.results = [];
                self.reidState.selectedResultId = '';
                self.reidState.trajectory = [];
                self.reidState.resultVideo = deepClone((MOCK.reid || {}).resultVideo || {});
                self.reidState.currentFrame = deepClone((MOCK.reid || {}).idleFrame || {});
                self.pushReidLog('info', '已创建重识别任务 ' + bundle.task.id + '。', bundle.task.startedAt);
                self.pushReidLog('info', '当前目标源：' + bundle.task.sourceName + '。', bundle.task.startedAt);

                self.reidElapsedTimer = setInterval(function () {
                    if (!self.reidState.isProcessing) {
                        return;
                    }

                    self.reidState.queryTask.elapsedMs = Date.now() - new Date(bundle.task.startedAt).getTime();
                }, 200);

                function runNextStep() {
                    var step;

                    if (stepIndex >= bundle.steps.length) {
                        self.completeReidTask(bundle);
                        return;
                    }

                    step = bundle.steps[stepIndex];
                    self.reidProgressTimer = setTimeout(function () {
                        self.reidState.progress = {
                            progress: step.progress,
                            detectedCandidates: step.detectedCandidates,
                            matchedCandidates: step.matchedCandidates,
                            finishedResults: step.finishedResults
                        };
                        self.reidState.currentFrame = deepClone(step.frame || self.reidState.currentFrame);
                        self.pushReidLog(step.level, step.message);
                        stepIndex += 1;
                        runNextStep();
                    }, step.delayMs);
                }

                runNextStep();
            },

            completeReidTask: function (bundle) {
                var topResult;
                var newRecord;

                this.stopReidTimers();
                this.reidState.isProcessing = false;
                this.reidState.queryTask.status = 'completed';
                this.reidState.queryTask.elapsedMs = Date.now() - new Date(bundle.task.startedAt).getTime();
                this.reidState.progress.progress = 100;
                this.reidState.results = bundle.results;
                this.reidState.selectedResultId = (bundle.results[0] || {}).id || '';
                this.reidState.trajectory = deepClone(bundle.trajectory || []);
                this.reidState.resultVideo = deepClone(bundle.resultVideo || {});
                this.reidState.currentFrame = deepClone(bundle.finalFrame || this.reidState.currentFrame);
                topResult = this.reidSelectedResult;

                if (topResult && topResult.resultClip) {
                    this.reidState.resultVideo = deepClone(topResult.resultClip);
                }

                if (topResult && topResult.trajectory) {
                    this.reidState.trajectory = deepClone(topResult.trajectory);
                }

                this.usageCount += 1;
                this.lastUsed = new Date().toISOString();
                this.persistSession();

                if (REID_WORKBENCH.createHistoryRecord && topResult) {
                    newRecord = REID_WORKBENCH.createHistoryRecord({
                        result: topResult,
                        task: this.reidState.queryTask,
                        queryImage: this.reidState.queryImage
                    });
                    this.historyRecords.unshift(newRecord);
                    this.recentRecords.unshift(newRecord);
                    this.recentRecords = this.recentRecords.slice(0, 6);
                }

                this.pushReidLog('success', 'Top-K 结果已生成，可查看详情卡片与轨迹列表。');
                this.queueToast('行人重识别已完成，结果列表和历史记录已更新。', 'success');
            },

            selectReidResult: function (result) {
                if (!result) {
                    return;
                }

                this.reidState.selectedResultId = result.id;
                this.reidState.trajectory = deepClone(result.trajectory || []);
                this.reidState.resultVideo = deepClone(result.resultClip || this.reidState.resultVideo);
                this.reidState.currentFrame = deepClone(result.currentFrame || this.reidState.currentFrame);
            },

            openHistoryDetail: function (record) {
                var self = this;
                var fullRecord = null;
                var index;

                if (self.isRealMode) {
                    self.selectedRecord = null;
                    self.showHistoryDetail = true;
                    self.detailLoading = true;

                    REID_API.fetchHistoryDetail({
                        baseUrl: self.apiBaseUrl,
                        id: record.id,
                        context: self.buildApiContext()
                    }).then(function (response) {
                        self.selectedRecord = response.record;
                    }).catch(function (error) {
                        self.selectedRecord = deepClone(record);
                        self.queueToast(error.message || '历史记录详情加载失败', 'error');
                    }).finally(function () {
                        self.detailLoading = false;
                    });
                    return;
                }

                for (index = 0; index < self.historyRecords.length; index += 1) {
                    if (self.historyRecords[index].id === record.id) {
                        fullRecord = deepClone(self.historyRecords[index]);
                        break;
                    }
                }

                self.selectedRecord = fullRecord || deepClone(record);
                self.showHistoryDetail = true;
                self.detailLoading = true;

                setTimeout(function () {
                    self.detailLoading = false;
                }, 280);
            },

            closeHistoryDetail: function () {
                this.showHistoryDetail = false;
                this.detailLoading = false;
                this.selectedRecord = null;
            },

            saveSettings: function () {
                this.ensureSettingsShape();
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
                this.syncReidDefaultsFromSettings(true);
                this.queueToast('设置保存成功，新的默认参数已同步到行人重识别工作台。', 'success');
            },

            getMockCropUrl: function (filename) {
                if (!filename) {
                    return '';
                }

                return '/javascript/dataset/crops/' + encodeURIComponent(filename);
            },

            getRecordQueryImageUrl: function (record) {
                if (record && record.queryImageUrl) {
                    return record.queryImageUrl;
                }

                return this.getMockCropUrl(record && record.queryImage);
            },

            getRecordMatchImageUrl: function (record) {
                if (record && record.matchImageUrl) {
                    return record.matchImageUrl;
                }

                return this.getMockCropUrl(record && record.matchImage);
            },

            getSourceLabel: function (sourceType) {
                var sourceOptions = (this.reidState || {}).sourceOptions || [];
                var index;

                for (index = 0; index < sourceOptions.length; index += 1) {
                    if (sourceOptions[index].value === sourceType) {
                        return sourceOptions[index].label;
                    }
                }

                return '未命名目标源';
            },

            getParamsSummary: function (paramsSummary, sourceLabel) {
                if (PLATFORM_INSIGHTS.buildParamsSummary) {
                    return PLATFORM_INSIGHTS.buildParamsSummary(paramsSummary, sourceLabel);
                }

                return [];
            },

            getCurrentReidParamsSummary: function () {
                return this.getParamsSummary(this.reidState.params, this.selectedReidSource.label);
            },

            getSelectedResultParamsSummary: function () {
                if (!this.reidSelectedResult) {
                    return [];
                }

                return this.getParamsSummary(
                    this.reidSelectedResult.paramsSummary || this.reidState.params,
                    ((this.reidSelectedResult.paramsSummary || {}).sourceName) || this.selectedReidSource.label
                );
            },

            getRecordParamsSummary: function (record) {
                var paramsSummary = (record || {}).paramsSummary || {
                    confThreshold: this.settings.defaults.confidence,
                    iouThreshold: this.settings.defaults.iou,
                    similarityThreshold: this.settings.defaults.similarity,
                    topK: this.settings.defaults.topK
                };
                var sourceLabel = paramsSummary.sourceName || (record || {}).sourceName || this.getSourceLabel(this.settings.defaults.sourceType);

                return this.getParamsSummary(paramsSummary, sourceLabel);
            },

            getCameraCardClass: function (camera) {
                if (!camera || camera.online === false || camera.level === 'offline') {
                    return 'is-offline';
                }

                if (camera.level === 'warning') {
                    return 'is-warning';
                }

                if (camera.level === 'attention') {
                    return 'is-attention';
                }

                return 'is-normal';
            },

            getRecordStatusText: function (status) {
                return recordStatusMeta(status).text;
            },

            getRecordStatusIcon: function (status) {
                return recordStatusMeta(status).icon;
            },

            getRecordStatusClass: function (status) {
                return recordStatusMeta(status).klass;
            },

            getServiceStatusText: function (status) {
                return serviceStatusMeta(status).text;
            },

            getServiceStatusIcon: function (status) {
                return serviceStatusMeta(status).icon;
            },

            getServiceStatusClass: function (status) {
                return serviceStatusMeta(status).klass;
            },

            getTaskStatusText: function (status) {
                return reidTaskStatusMeta(status).text;
            },

            getTaskStatusIcon: function (status) {
                return reidTaskStatusMeta(status).icon;
            },

            getTaskStatusClass: function (status) {
                return reidTaskStatusMeta(status).klass;
            },

            getSaveStateText: function (saved) {
                return saved ? '已保存' : '仅本次展示';
            },

            getSaveStateClass: function (saved) {
                return saved ? 'is-verified' : 'is-neutral';
            },

            getThresholdStateText: function (result) {
                return result && result.passedThreshold ? '超过阈值' : '低于阈值';
            },

            getThresholdStateClass: function (result) {
                return result && result.passedThreshold ? 'is-verified' : 'is-review';
            },

            getLogLevelClass: function (level) {
                var classMap = {
                    info: 'is-info',
                    warning: 'is-warning',
                    success: 'is-success',
                    error: 'is-error'
                };

                return classMap[level] || 'is-info';
            },

            getCameraLevelText: function (level) {
                var textMap = {
                    normal: '正常',
                    attention: '拥挤',
                    warning: '预警',
                    offline: '离线'
                };

                return textMap[level] || '未知';
            },

            getCameraLevelIcon: function (level) {
                var iconMap = {
                    normal: 'fas fa-circle-check',
                    attention: 'fas fa-eye',
                    warning: 'fas fa-bell',
                    offline: 'fas fa-circle-stop'
                };

                return iconMap[level] || 'fas fa-circle-question';
            },

            getCameraLevelClass: function (level) {
                var classMap = {
                    normal: 'is-verified',
                    attention: 'is-review',
                    warning: 'is-alert',
                    offline: 'is-neutral'
                };

                return classMap[level] || 'is-neutral';
            },

            getTimelineWidth: function (visitors) {
                var maxVisitors = 1;
                var index;

                for (index = 0; index < this.monitoringTimeline.length; index += 1) {
                    maxVisitors = Math.max(maxVisitors, Number(this.monitoringTimeline[index].visitors || 0));
                }

                return Math.round((Number(visitors || 0) / maxVisitors) * 100) + '%';
            },

            getZonePercent: function (zone) {
                if (!zone || !zone.capacity) {
                    return '0%';
                }

                return Math.min(100, Math.round((Number(zone.visitors || 0) / Number(zone.capacity)) * 100)) + '%';
            },

            getCapacityPercent: function () {
                var warningCapacity = Number(this.statisticsCapacity.warningCapacity || 1);
                var currentVisitors = Number(this.statisticsCapacity.currentVisitors || 0);
                return Math.min(100, Math.round((currentVisitors / warningCapacity) * 100)) + '%';
            }
        },
        watch: {
            currentRoute: function (nextRoute) {
                if (window.location.hash !== '#/' + nextRoute) {
                    window.location.hash = '#/' + nextRoute;
                }

                if (!this.isRealMode) {
                    return;
                }

                if (nextRoute === 'history') {
                    this.loadHistoryRecords();
                }

                if (nextRoute === 'home') {
                    this.loadRecentRecords({ pageSize: 6 });
                }
            },
            settings: {
                deep: true,
                handler: function () {
                    this.ensureSettingsShape();
                }
            },
            historyFilters: {
                deep: true,
                handler: function () {
                    if (this.isRealMode && this.currentRoute === 'history') {
                        this.scheduleHistoryFetch();
                    }
                }
            }
        },
        mounted: function () {
            this.restoreSettings();
            this.ensureSettingsShape();
            this.reidState = createInitialReidState(this.settings);
            this.restoreSession();

            if (isPreviewModeEnabled()) {
                this.enterPreviewMode(true);
            }

            if (!window.location.hash) {
                window.location.hash = '#/' + this.currentRoute;
            }

            this.syncReidDefaultsFromSettings(true);
            if (!this.selectedMonitoringZoneName && this.monitoringHeatmapMap.length > 0) {
                this.selectedMonitoringZoneName = this.monitoringHeatmapMap[0].name;
            }
            if (this.monitoringTimeline.length > 0) {
                this.selectedMonitoringTimelineIndex = Math.min(3, this.monitoringTimeline.length - 1);
            }

            if (this.isRealMode) {
                this.loadRecentRecords({ pageSize: 6 });
                if (this.currentRoute === 'history') {
                    this.loadHistoryRecords();
                }
            }
            window.addEventListener('hashchange', this.syncRouteFromHash);
        },
        beforeDestroy: function () {
            window.removeEventListener('hashchange', this.syncRouteFromHash);
            this.clearCodeCooldown('register');
            this.clearCodeCooldown('reset');
            this.stopReidTimers();
            if (this.historyFetchTimer) {
                clearTimeout(this.historyFetchTimer);
                this.historyFetchTimer = null;
            }
        }
    });
}());
