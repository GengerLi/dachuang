window.REID_MOCK_DATA = {
    user: {
        username: '景区值守员',
        email: 'ops@jingqu.local',
        usageCount: 128,
        lastUsed: '2026-04-10T09:18:00+08:00',
        registrationDate: '2026-03-02T10:00:00+08:00'
    },
    previewUser: {
        username: '系统管理员',
        email: 'admin@jingqu.local',
        usageCount: 12,
        lastUsed: '2026-04-10T08:32:00+08:00',
        registrationDate: '2026-03-27T10:00:00+08:00'
    },
    overview: {
        stats: [
            {
                key: 'todayDetectionCount',
                title: '今日检测次数',
                value: 2486,
                unit: '次',
                delta: '+12%',
                icon: 'fas fa-camera-retro',
                tone: 'primary'
            },
            {
                key: 'todayReidCount',
                title: '今日重识别次数',
                value: 326,
                unit: '次',
                delta: '+8%',
                icon: 'fas fa-user-check',
                tone: 'primary'
            },
            {
                key: 'cameraOnline',
                title: '在线摄像头',
                value: '14 / 16',
                unit: '',
                delta: '2 路离线',
                icon: 'fas fa-video',
                tone: 'success'
            },
            {
                key: 'todayAlertCount',
                title: '今日预警数',
                value: 8,
                unit: '条',
                delta: '较昨日 -2',
                icon: 'fas fa-triangle-exclamation',
                tone: 'warning'
            },
            {
                key: 'pendingTasks',
                title: '待处理预警',
                value: 3,
                unit: '项',
                delta: '2 条待复核 / 1 条待派发',
                icon: 'fas fa-list-check',
                tone: 'warning'
            },
            {
                key: 'currentVisitors',
                title: '当前景区估计人数',
                value: 386,
                unit: '人',
                delta: '主峰值 512 人',
                icon: 'fas fa-people-group',
                tone: 'info'
            },
            {
                key: 'recentSync',
                title: '最近使用时间',
                value: '09:18',
                unit: '',
                delta: '2026-04-10',
                icon: 'fas fa-clock',
                tone: 'neutral'
            }
        ],
        shortcuts: [
            {
                route: 'monitoring',
                label: '进入实时监测',
                description: '查看摄像头在线状态与区域人数',
                icon: 'fas fa-satellite-dish'
            },
            {
                route: 'reid',
                label: '进入行人重识别',
                description: '打开核心工作台并执行一次完整检索流程',
                icon: 'fas fa-user-check'
            },
            {
                route: 'history',
                label: '查看历史记录',
                description: '检索识别记录并查看详情',
                icon: 'fas fa-table-list'
            },
            {
                route: 'statistics',
                label: '查看数据统计',
                description: '查看人流趋势、区域热度与承载摘要',
                icon: 'fas fa-chart-column'
            }
        ],
        recentRecords: [
            {
                id: 'REC-20260410-001',
                queryImage: '0001_c1s1_000003_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000003_01.jpg',
                matchImage: '0002_c1s1_000003_02.jpg',
                similarity: 96.2,
                camera: '南门广场-03',
                location: '南门游客集散区',
                time: '2026-04-10T08:32:12+08:00',
                status: 'verified',
                saved: true,
                note: '已确认与重点检索库命中'
            },
            {
                id: 'REC-20260410-002',
                queryImage: '0001_c1s1_000005_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000005_01.jpg',
                matchImage: '0002_c1s1_000005_02.jpg',
                similarity: 93.4,
                camera: '湖心步道-01',
                location: '湖心步道',
                time: '2026-04-10T08:45:56+08:00',
                status: 'review',
                saved: false,
                note: '待二次确认遮挡区域'
            },
            {
                id: 'REC-20260410-003',
                queryImage: '0001_c1s1_000006_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000006_01.jpg',
                matchImage: '0002_c1s1_000006_02.jpg',
                similarity: 91.1,
                camera: '缆车入口-02',
                location: '缆车排队区',
                time: '2026-04-10T09:02:31+08:00',
                status: 'alert',
                saved: true,
                note: '已推送告警'
            },
            {
                id: 'REC-20260410-004',
                queryImage: '0001_c1s1_000011_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000011_01.jpg',
                matchImage: '0002_c1s1_000011_02.jpg',
                similarity: 94.8,
                camera: '山顶观景台-02',
                location: '山顶观景台',
                time: '2026-04-10T09:15:42+08:00',
                status: 'verified',
                saved: true,
                note: '游客高峰期复核完成'
            }
        ],
        systemStatus: [
            {
                key: 'detector',
                label: '检测服务状态',
                status: 'running',
                detail: '实时检测任务队列稳定'
            },
            {
                key: 'reid',
                label: '重识别服务状态',
                status: 'running',
                detail: '模型响应均值 1.8 秒'
            },
            {
                key: 'database',
                label: '数据库状态',
                status: 'running',
                detail: '最近一次写入成功'
            },
            {
                key: 'sync',
                label: '最后同步时间',
                status: 'syncing',
                detail: '2026-04-10 09:20:18'
            }
        ]
    },
    monitoring: {
        summary: {
            onlineCameras: 14,
            totalCameras: 16,
            currentVisitors: 386,
            alertCount: 8,
            reidQueue: 5
        },
        cameras: [
            {
                id: 'CAM-01',
                name: '南门广场-01',
                zone: '南门广场',
                online: true,
                visitors: 43,
                lastFrameAt: '2026-04-10T09:21:03+08:00',
                poster: '0001_c1s1_000004_01.jpg',
                level: 'normal'
            },
            {
                id: 'CAM-02',
                name: '南门广场-03',
                zone: '南门游客集散区',
                online: true,
                visitors: 57,
                lastFrameAt: '2026-04-10T09:20:58+08:00',
                poster: '0002_c1s1_000003_02.jpg',
                level: 'attention'
            },
            {
                id: 'CAM-03',
                name: '湖心步道-01',
                zone: '湖心步道',
                online: true,
                visitors: 31,
                lastFrameAt: '2026-04-10T09:20:51+08:00',
                poster: '0001_c1s1_000009_01.jpg',
                level: 'normal'
            },
            {
                id: 'CAM-04',
                name: '缆车入口-02',
                zone: '缆车排队区',
                online: true,
                visitors: 64,
                lastFrameAt: '2026-04-10T09:21:05+08:00',
                poster: '0002_c1s1_000010_02.jpg',
                level: 'warning'
            },
            {
                id: 'CAM-05',
                name: '山顶观景台-02',
                zone: '山顶观景台',
                online: true,
                visitors: 22,
                lastFrameAt: '2026-04-10T09:20:44+08:00',
                poster: '0001_c1s1_000011_01.jpg',
                level: 'normal'
            },
            {
                id: 'CAM-06',
                name: '北门停车场-01',
                zone: '北门停车场',
                online: false,
                visitors: 0,
                lastFrameAt: '2026-04-10T08:57:18+08:00',
                poster: '0002_c1s1_000012_02.jpg',
                level: 'offline'
            }
        ],
        heatmapZones: [
            { name: '南门广场', level: 86 },
            { name: '湖心步道', level: 54 },
            { name: '缆车排队区', level: 91 },
            { name: '山顶观景台', level: 48 },
            { name: '北门停车场', level: 29 }
        ],
        timeline: [
            { time: '08:00', visitors: 120 },
            { time: '08:30', visitors: 188 },
            { time: '09:00', visitors: 296 },
            { time: '09:30', visitors: 386 },
            { time: '10:00', visitors: 412 },
            { time: '10:30', visitors: 398 }
        ]
    },
    statistics: {
        summary: {
            totalVisitors: 18542,
            todayReidCount: 326,
            todayAlertCount: 8,
            peakLoad: 82
        },
        trend: [
            { label: '08:00', detections: 120, reid: 18 },
            { label: '09:00', detections: 260, reid: 42 },
            { label: '10:00', detections: 340, reid: 58 },
            { label: '11:00', detections: 416, reid: 71 },
            { label: '12:00', detections: 392, reid: 63 },
            { label: '13:00', detections: 364, reid: 51 },
            { label: '14:00', detections: 328, reid: 47 }
        ],
        zones: [
            { name: '南门广场', visitors: 4200, capacity: 5000 },
            { name: '湖心步道', visitors: 2800, capacity: 3600 },
            { name: '缆车排队区', visitors: 3680, capacity: 4000 },
            { name: '山顶观景台', visitors: 2140, capacity: 3000 },
            { name: '北门停车场', visitors: 1530, capacity: 2800 }
        ],
        capacity: {
            currentVisitors: 386,
            safeCapacity: 450,
            warningCapacity: 600,
            peakVisitors: 512,
            forecast: '未来 30 分钟预计继续上升 6%'
        }
    },
    history: {
        filters: {
            cameras: ['全部', '南门广场-03', '湖心步道-01', '缆车入口-02', '山顶观景台-02'],
            locations: ['全部', '南门游客集散区', '湖心步道', '缆车排队区', '山顶观景台'],
            statuses: ['全部', 'verified', 'review', 'alert']
        },
        records: [
            {
                id: 'REC-20260410-001',
                queryImage: '0001_c1s1_000003_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000003_01.jpg',
                matchImage: '0002_c1s1_000003_02.jpg',
                similarity: 96.2,
                camera: '南门广场-03',
                location: '南门游客集散区',
                time: '2026-04-10T08:32:12+08:00',
                status: 'verified',
                saved: true,
                operator: '值守员-01',
                note: '已确认与走失人员比对库结果一致'
            },
            {
                id: 'REC-20260410-002',
                queryImage: '0001_c1s1_000005_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000005_01.jpg',
                matchImage: '0002_c1s1_000005_02.jpg',
                similarity: 93.4,
                camera: '湖心步道-01',
                location: '湖心步道',
                time: '2026-04-10T08:45:56+08:00',
                status: 'review',
                saved: false,
                operator: '值守员-02',
                note: '待人工二次确认遮挡区域'
            },
            {
                id: 'REC-20260410-003',
                queryImage: '0001_c1s1_000006_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000006_01.jpg',
                matchImage: '0002_c1s1_000006_02.jpg',
                similarity: 91.1,
                camera: '缆车入口-02',
                location: '缆车排队区',
                time: '2026-04-10T09:02:31+08:00',
                status: 'alert',
                saved: true,
                operator: '值守员-01',
                note: '与重点关注库命中，已推送告警'
            },
            {
                id: 'REC-20260410-004',
                queryImage: '0001_c1s1_000011_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000011_01.jpg',
                matchImage: '0002_c1s1_000011_02.jpg',
                similarity: 94.8,
                camera: '山顶观景台-02',
                location: '山顶观景台',
                time: '2026-04-10T09:15:42+08:00',
                status: 'verified',
                saved: true,
                operator: '值守员-03',
                note: '游客高峰期复核完成'
            },
            {
                id: 'REC-20260410-005',
                queryImage: '0001_c1s1_000012_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000012_01.jpg',
                matchImage: '0002_c1s1_000012_02.jpg',
                similarity: 89.7,
                camera: '南门广场-03',
                location: '南门游客集散区',
                time: '2026-04-10T09:18:21+08:00',
                status: 'review',
                saved: false,
                operator: '值守员-01',
                note: '目标行进方向变化较快'
            },
            {
                id: 'REC-20260410-006',
                queryImage: '0001_c1s1_000013_01.jpg',
                queryImageUrl: '/javascript/dataset/crops/0001_c1s1_000013_01.jpg',
                matchImage: '0002_c1s1_000013_02.jpg',
                similarity: 95.0,
                camera: '缆车入口-02',
                location: '缆车排队区',
                time: '2026-04-10T09:20:17+08:00',
                status: 'verified',
                saved: true,
                operator: '值守员-02',
                note: '匹配结果已加入日报'
            }
        ]
    },
    reid: {
        sampleQuery: {
            filename: '0002_c1s1_000012_02.jpg',
            name: 'query-image-01.jpg',
            sizeBytes: 248360,
            width: 720,
            height: 960
        },
        sourceOptions: [
            {
                value: 'localVideo',
                label: '视频库',
                description: '南门巡检录像 / 15 分钟片段'
            },
            {
                value: 'cameraStream',
                label: '实时监控源',
                description: '景区实时监控画面'
            },
            {
                value: 'historyLibrary',
                label: '历史图像库',
                description: '重点区域历史抓拍记录'
            }
        ],
        params: {
            confThreshold: 0.72,
            iouThreshold: 0.45,
            similarityThreshold: 0.88,
            topK: 5,
            autoSaveResult: true,
            defaultSource: 'localVideo'
        },
        initialLogs: [
            {
                time: '2026-04-10T09:20:00+08:00',
                level: 'info',
                message: '工作台已就绪，等待上传查询图。'
            }
        ],
        idleFrame: {
            title: '当前处理帧',
            caption: '任务开始后展示关键抽帧',
            image: '',
            timestamp: '--:--'
        },
        processFrames: [
            {
                title: '预处理帧',
                caption: '南门广场-01 / 第 128 帧',
                image: '0001_c1s1_000004_01.jpg',
                timestamp: '09:21:03'
            },
            {
                title: '候选检测帧',
                caption: '湖心步道-01 / 第 214 帧',
                image: '0001_c1s1_000009_01.jpg',
                timestamp: '09:21:08'
            },
            {
                title: '特征比对帧',
                caption: '缆车入口-02 / 第 308 帧',
                image: '0002_c1s1_000010_02.jpg',
                timestamp: '09:21:13'
            },
            {
                title: '结果确认帧',
                caption: '南门广场-03 / 命中帧',
                image: '0002_c1s1_000003_02.jpg',
                timestamp: '09:21:18'
            }
        ],
        processSteps: [
            {
                delayMs: 480,
                progress: 12,
                detectedCandidates: 8,
                matchedCandidates: 0,
                finishedResults: 0,
                level: 'info',
                message: '查询图片已加载，正在执行图像预处理。',
                frameIndex: 0
            },
            {
                delayMs: 560,
                progress: 28,
                detectedCandidates: 24,
                matchedCandidates: 4,
                finishedResults: 0,
                level: 'info',
                message: '目标源已确认，正在提取行人特征。',
                frameIndex: 1
            },
            {
                delayMs: 620,
                progress: 52,
                detectedCandidates: 37,
                matchedCandidates: 9,
                finishedResults: 1,
                level: 'info',
                message: '正在检索候选记录并执行相似度比对。',
                frameIndex: 2
            },
            {
                delayMs: 620,
                progress: 78,
                detectedCandidates: 43,
                matchedCandidates: 12,
                finishedResults: 3,
                level: 'warning',
                message: '正在生成 Top-K 匹配结果与详情摘要。',
                frameIndex: 2
            },
            {
                delayMs: 520,
                progress: 100,
                detectedCandidates: 46,
                matchedCandidates: 14,
                finishedResults: 5,
                level: 'success',
                message: '识别任务已完成，结果与轨迹信息已生成。',
                frameIndex: 3
            }
        ],
        resultVideo: {
            title: '结果视频区',
            clipName: '等待生成结果片段',
            description: '用于展示识别任务关联视频片段与关键画面信息。',
            duration: '--:--'
        },
        resultCatalog: [
            {
                matchImage: '0002_c1s1_000003_02.jpg',
                similarity: 96.2,
                cameraName: '南门广场-03',
                location: '南门游客集散区',
                captureTime: '2026-04-10T09:21:18+08:00',
                status: 'verified',
                note: '与南门广场重点检索片段高度匹配。',
                resultClip: {
                    title: '结果视频区',
                    clipName: '南门广场_A01.mp4',
                    description: '展示南门广场关联视频片段与关键画面。',
                    duration: '00:18'
                },
                currentFrame: {
                    title: '命中结果帧',
                    caption: '南门广场-03 / Top-1 命中',
                    image: '0002_c1s1_000003_02.jpg',
                    timestamp: '09:21:18'
                },
                trajectory: [
                    { seq: 1, cameraName: '南门广场-01', location: '南门入口', timestamp: '2026-04-10T09:16:02+08:00' },
                    { seq: 2, cameraName: '南门广场-02', location: '游客服务中心外侧', timestamp: '2026-04-10T09:17:15+08:00' },
                    { seq: 3, cameraName: '南门广场-03', location: '南门游客集散区', timestamp: '2026-04-10T09:21:18+08:00' }
                ]
            },
            {
                matchImage: '0002_c1s1_000010_02.jpg',
                similarity: 94.7,
                cameraName: '缆车入口-02',
                location: '缆车排队区',
                captureTime: '2026-04-10T09:19:42+08:00',
                status: 'verified',
                note: '服饰纹理与步态特征接近。',
                resultClip: {
                    title: '结果视频区',
                    clipName: '缆车入口_B07.mp4',
                    description: '展示缆车入口关联录像片段。',
                    duration: '00:14'
                },
                currentFrame: {
                    title: '候选命中帧',
                    caption: '缆车入口-02 / Top-2',
                    image: '0002_c1s1_000010_02.jpg',
                    timestamp: '09:19:42'
                },
                trajectory: [
                    { seq: 1, cameraName: '湖心步道-01', location: '湖心步道入口', timestamp: '2026-04-10T09:09:22+08:00' },
                    { seq: 2, cameraName: '缆车入口-01', location: '缆车引导区', timestamp: '2026-04-10T09:14:10+08:00' },
                    { seq: 3, cameraName: '缆车入口-02', location: '缆车排队区', timestamp: '2026-04-10T09:19:42+08:00' }
                ]
            },
            {
                matchImage: '0002_c1s1_000005_02.jpg',
                similarity: 92.9,
                cameraName: '湖心步道-01',
                location: '湖心步道',
                captureTime: '2026-04-10T09:13:05+08:00',
                status: 'review',
                note: '遮挡较多，建议人工二次复核。',
                resultClip: {
                    title: '结果视频区',
                    clipName: '湖心步道_C03.mp4',
                    description: '展示湖心步道相关画面，便于复核轨迹。',
                    duration: '00:11'
                },
                currentFrame: {
                    title: '复核候选帧',
                    caption: '湖心步道-01 / Top-3',
                    image: '0002_c1s1_000005_02.jpg',
                    timestamp: '09:13:05'
                },
                trajectory: [
                    { seq: 1, cameraName: '南门广场-03', location: '南门游客集散区', timestamp: '2026-04-10T09:00:26+08:00' },
                    { seq: 2, cameraName: '湖心步道-01', location: '湖心步道', timestamp: '2026-04-10T09:13:05+08:00' },
                    { seq: 3, cameraName: '山顶观景台-01', location: '观景步道出口', timestamp: '2026-04-10T09:24:11+08:00' }
                ]
            },
            {
                matchImage: '0002_c1s1_000011_02.jpg',
                similarity: 91.4,
                cameraName: '山顶观景台-02',
                location: '山顶观景台',
                captureTime: '2026-04-10T09:24:11+08:00',
                status: 'review',
                note: '远景拍摄导致轮廓信息偏弱。',
                resultClip: {
                    title: '结果视频区',
                    clipName: '山顶观景台_D09.mp4',
                    description: '展示山顶观景台关联片段，便于多帧复核。',
                    duration: '00:09'
                },
                currentFrame: {
                    title: '远景命中帧',
                    caption: '山顶观景台-02 / Top-4',
                    image: '0002_c1s1_000011_02.jpg',
                    timestamp: '09:24:11'
                },
                trajectory: [
                    { seq: 1, cameraName: '缆车入口-02', location: '缆车排队区', timestamp: '2026-04-10T09:19:42+08:00' },
                    { seq: 2, cameraName: '山顶观景台-01', location: '观景步道出口', timestamp: '2026-04-10T09:22:48+08:00' },
                    { seq: 3, cameraName: '山顶观景台-02', location: '山顶观景台', timestamp: '2026-04-10T09:24:11+08:00' }
                ]
            },
            {
                matchImage: '0002_c1s1_000012_02.jpg',
                similarity: 89.8,
                cameraName: '北门停车场-01',
                location: '北门停车场',
                captureTime: '2026-04-10T09:08:33+08:00',
                status: 'review',
                note: '相似度略高于预警线，但场景跨度较大。',
                resultClip: {
                    title: '结果视频区',
                    clipName: '北门停车场_E02.mp4',
                    description: '展示北门停车场相关画面，用于辅助复核。',
                    duration: '00:13'
                },
                currentFrame: {
                    title: '低置信候选帧',
                    caption: '北门停车场-01 / Top-5',
                    image: '0002_c1s1_000012_02.jpg',
                    timestamp: '09:08:33'
                },
                trajectory: [
                    { seq: 1, cameraName: '南门广场-01', location: '南门入口', timestamp: '2026-04-10T08:51:07+08:00' },
                    { seq: 2, cameraName: '北门通道-01', location: '北门通道', timestamp: '2026-04-10T09:03:12+08:00' },
                    { seq: 3, cameraName: '北门停车场-01', location: '北门停车场', timestamp: '2026-04-10T09:08:33+08:00' }
                ]
            }
        ],
        hints: [
            '支持上传查询图片并发起行人重识别任务。',
            '结果区集中展示 Top-K 匹配结果、参数摘要与轨迹信息。',
            '首页与历史记录可同步查看识别任务摘要和保存状态。'
        ]
    },
    settings: {
        notifications: true,
        autoSave: true,
        soundAlerts: false,
        theme: 'system-blue',
        defaults: {
            confidence: 0.72,
            iou: 0.45,
            similarity: 0.88,
            topK: 5,
            sourceType: 'localVideo'
        }
    }
};
