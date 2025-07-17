let view;
let map;
let layers = {};
let stats = {
    totalCenters: 0,
    totalTransfers: 0,
    avgTransfers: 0,
    activeCenters: 0
};
let currentTheme = 'light';
let popupGraphic = null;

function loadModule(moduleName) {
    return new Promise((resolve, reject) => {
        require([moduleName], (module) => {
            if (module) {
                resolve(module);
            } else {
                reject(new Error(`Module not found: ${moduleName}`));
            }
        }, (error) => {
            reject(error);
        });
    });
}

async function initializeHealthcareDashboard() {
    try {
        showLoading(true);
        
        const [
            esriConfig, 
            intl, 
            Map, 
            MapView, 
            reactiveUtils, 
            GeoJSONLayer, 
            GraphicsLayer,
            Graphic,
            Point,
            Locate
        ] = await Promise.all([
            loadModule("esri/config"),
            loadModule("esri/intl"),
            loadModule("esri/Map"),
            loadModule("esri/views/MapView"),
            loadModule("esri/core/reactiveUtils"),
            loadModule("esri/layers/GeoJSONLayer"),
            loadModule("esri/layers/GraphicsLayer"),
            loadModule("esri/Graphic"),
            loadModule("esri/geometry/Point"),
            loadModule("esri/widgets/Locate")
        ]);

        intl.setLocale("ar");
        esriConfig.apiKey = "AAPK756f006de03e44d28710cb446c8dedb4rkQyhmzX6upFiYPzQT0HNQNMJ5qPyO1TnPDSPXT4EAM_DlQSj20ShRD7vyKa7a1H";

        // Create heatmap renderer
        const heatmapRenderer = {
            type: "heatmap",
            field: "transfers_number",
            colorStops: [
                { color: [133, 193, 200, 0], ratio: 0 },
                { color: [133, 193, 200, 255], ratio: 0.01 },
                { color: [144, 161, 190, 255], ratio: 0.0925 },
                { color: [156, 129, 132, 255], ratio: 0.175 },
                { color: [167, 97, 170, 255], ratio: 0.2575 },
                { color: [175, 73, 128, 255], ratio: 0.34 },
                { color: [184, 48, 85, 255], ratio: 0.4225 },
                { color: [192, 24, 42, 255], ratio: 0.505 },
                { color: [200, 0, 0, 255], ratio: 0.5875 },
                { color: [211, 51, 0, 255], ratio: 0.67 },
                { color: [222, 102, 0, 255], ratio: 0.7525 },
                { color: [233, 153, 0, 255], ratio: 0.835 },
                { color: [244, 204, 0, 255], ratio: 0.9175 },
                { color: [255, 255, 0, 255], ratio: 1 }
            ],
            maxDensity: 7,
            minDensity: 0
        };

        // Simple renderer for zoomed in view
        const simpleRenderer = {
            type: "simple",
            symbol: {
                type: "simple-marker",
                size: 10,
                color: [175, 73, 128, 0.8],
                outline: {
                    color: [255, 255, 255, 0.8],
                    width: 2
                }
            }
        };

        // Create map
        map = new Map({
            basemap: "gray-vector"
        });

        // Create view with custom settings
        view = new MapView({
            container: "viewDiv",
            center: [43.417931, 18.778259],
            zoom: 8,
            map: map,
            popup: null, // Disable default popup
            ui: {
                components: [] // Remove default UI components
            }
        });

        // Create healthcare centers layer
        layers.healthcareCenters = new GeoJSONLayer({
            url: "https://raw.githubusercontent.com/gulfterminal-GIS/Asir-Diseases/refs/heads/main/transfers_number.geojson",
            title: "المراكز الصحية",
            renderer: heatmapRenderer,
            outFields: "*",
            visible: true
        });

        // Create cities layer with custom renderer
        layers.cities = new GeoJSONLayer({
            url: "https://raw.githubusercontent.com/gulfterminal-GIS/Asir-Diseases/refs/heads/main/aser_cities.geojson",
            title: "المدن",
            renderer: {
                type: "simple",
                symbol: {
                    type: "simple-fill",
                    color: [37, 99, 235, 0.1],
                    outline: {
                        color: [37, 99, 235, 0.5],
                        width: 2
                    }
                }
            },
            visible: false,
            labelingInfo: [{
                symbol: {
                    type: "text",
                    color: "#1f2937",
                    haloColor: "white",
                    haloSize: 2,
                    font: {
                        size: 12,
                        family: "Arial",
                        weight: "bold"
                    }
                },
                labelPlacement: "center-center",
                labelExpressionInfo: {
                    expression: "$feature.Gov_name"
                }
            }]
        });

        // Create boundaries layer
        layers.boundaries = new GeoJSONLayer({
            url: "https://raw.githubusercontent.com/gulfterminal-GIS/Asir-Diseases/refs/heads/main/aser_boundaries.geojson",
            title: "حدود المنطقة",
            renderer: {
                type: "simple",
                symbol: {
                    type: "simple-fill",
                    color: [0, 0, 0, 0],
                    outline: {
                        color: [124, 58, 237, 0.8],
                        width: 3
                    }
                }
            },
            visible: false
        });

        // Add layers to map
        map.add(layers.boundaries);
        map.add(layers.cities);
        map.add(layers.healthcareCenters);

        // Create graphics layer for custom popups
        const popupLayer = new GraphicsLayer({
            elevationInfo: {
                mode: "on-the-ground"
            }
        });
        map.add(popupLayer);

        // Wait for layers to load
        await view.when();

        // Setup view interactions
        Promise.all([
            view.whenLayerView(layers.healthcareCenters),
            view.whenLayerView(layers.cities),
            view.whenLayerView(layers.boundaries)
        ]).then(([healthLayerView, citiesLayerView, boundariesLayerView]) => {
            return Promise.all([
                reactiveUtils.whenOnce(() => !healthLayerView.updating)
            ]);
        }).then(() => {
            // Go to healthcare centers extent
            view.goTo({
                target: layers.healthcareCenters.fullExtent
            }, {
                duration: 2000
            });

            // Calculate statistics
            calculateStatistics();
            // // Setup search functionality
            // setupSearch(view);

            // Switch renderer based on zoom
            const savedHeatmapRenderer = layers.healthcareCenters.renderer;
            reactiveUtils.watch(
                () => view.scale,
                (scale) => {
                    layers.healthcareCenters.renderer = scale <= 72224 ? simpleRenderer : savedHeatmapRenderer;
                }
            );
        });

        // Setup custom event handlers
        setupCustomEventHandlers(view, Graphic, Point);
        
        // Setup custom controls
        setupCustomControls(view, Locate);
        
        // Initialize theme
        initializeTheme();

        showLoading(false);

        return [view, map];
    } catch (error) {
        console.error("Error initializing dashboard:", error);
        showLoading(false);
        throw error;
    }
}

// Setup custom map controls
function setupCustomControls(view, Locate) {
    // Zoom controls
    document.getElementById('zoomIn').addEventListener('click', () => {
        view.zoom += 1;
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
        view.zoom -= 1;
    });

    // Home button
    document.getElementById('homeBtn').addEventListener('click', () => {
        view.goTo({
            target: layers.healthcareCenters.fullExtent
        }, {
            duration: 1000
        });
    });

    // Location button
    document.getElementById('locationBtn').addEventListener('click', async () => {
        const locate = new Locate({
            view: view
        });
        await locate.locate();
    });
}

// Setup custom event handlers
function setupCustomEventHandlers(view, Graphic, Point) {
    // Handle map clicks for custom popups
    view.on("click", async (event) => {
        try {
            const response = await view.hitTest(event);
            const results = response.results.filter(result => 
                result.graphic.layer === layers.healthcareCenters
            );

            if (results.length > 0) {
                const graphic = results[0].graphic;
                showCustomPopup(graphic, Point);
            } else {
                hideCustomPopup();
            }
        } catch (error) {
            console.error("Error handling click:", error);
        }
    });

    // Handle popup close
    document.getElementById('popupClose').addEventListener('click', () => {
        hideCustomPopup();
    });

    // Layer toggles
    document.getElementById('healthLayer').addEventListener('change', (e) => {
        layers.healthcareCenters.visible = e.target.checked;
    });

    document.getElementById('citiesLayer').addEventListener('change', (e) => {
        layers.cities.visible = e.target.checked;
    });

    document.getElementById('boundariesLayer').addEventListener('change', (e) => {
        layers.boundaries.visible = e.target.checked;
    });

    // Legend and layer control toggles
    document.getElementById('legendToggle').addEventListener('click', () => {
        const content = document.querySelector('.legend-content');
        const icon = document.querySelector('#legendToggle i');
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });

    document.getElementById('layerToggle').addEventListener('click', () => {
        const content = document.querySelector('.layer-content');
        const icon = document.querySelector('#layerToggle i');
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}

// Show custom popup
function showCustomPopup(graphic, Point) {
    const popup = document.getElementById('customPopup');
    const attributes = graphic.attributes;
    
    // Debug: log attributes to see what fields are available
    console.log('Popup attributes:', attributes);

    // Update popup title using the correct field names
    document.getElementById('popupTitle').textContent = 
        attributes.facility_name || 
        attributes['اسم_التجمع'] || 
        'مركز صحي';

    // Create popup content with correct field names
    const content = `
        <div class="popup-info-grid">
            <div class="popup-info-item">
                <div class="popup-info-label">اسم التجمع</div>
                <div class="popup-info-value">${attributes['اسم_التجمع'] || 'غير محدد'}</div>
            </div>
            <div class="popup-info-item">
                <div class="popup-info-label">النوع</div>
                <div class="popup-info-value">${attributes.facility_type || 'غير محدد'}</div>
            </div>
            <div class="popup-info-item">
                <div class="popup-info-label">القطاع</div>
                <div class="popup-info-value">${attributes.Sector || 'غير محدد'}</div>
            </div>
            <div class="popup-info-item">
                <div class="popup-info-label">الحالة</div>
                <div class="popup-info-value">${attributes.facility_status || 'غير محدد'}</div>
            </div>
            <div class="popup-info-item">
                <div class="popup-info-label">ساعات العمل</div>
                <div class="popup-info-value">${attributes.working_hours || 'غير محدد'}</div>
            </div>
            <div class="popup-info-item">
                <div class="popup-info-label">الإحداثيات</div>
                <div class="popup-info-value" style="font-size: 0.875rem;">
                    ${attributes.latitude ? `${attributes.latitude.toFixed(4)}, ${attributes.longitude.toFixed(4)}` : 'غير محدد'}
                </div>
            </div>

            <div class="popup-info-item">
                <div class="popup-info-label">الحجم</div>
                <div class="popup-info-value">${attributes.Size || 'غير محدد'} ساعة</div>
            </div>
        </div>
        
        <h4 style="margin-top: 1.5rem; margin-bottom: 1rem; color: var(--text-secondary);">
            <i class="fas fa-exchange-alt"></i> عدد التحويلات
        </h4>
        <div class="popup-info-grid">
            <div class="popup-info-item">
                <div class="popup-info-label">إجمالي التحويلات</div>
                <div class="popup-info-value" style="color: var(--primary-color); font-size: 1.5rem;">
                    ${attributes.transfers_number || 0}
                </div>
            </div>
        </div>
        
        <h4 style="margin-top: 1.5rem; margin-bottom: 1rem; color: var(--text-secondary);">
            <i class="fas fa-virus"></i> توزيع الأمراض
        </h4>
        <div class="disease-grid" style="grid-template-columns: repeat(3, 1fr);">
            ${createDiseaseItem('الغدة الدرقية', attributes.thyroid_gland || 0)}
            ${createDiseaseItem('دهون الدم', attributes.tlood_lipids || 0)}
            ${createDiseaseItem('المرارة', attributes.gallbladder || 0)}
            ${createDiseaseItem('فقر الدم المنجلي', attributes.sickle_cell_anemia || 0)}
            ${createDiseaseItem('أمراض الكبد', attributes.liver_disease || 0)}
            ${createDiseaseItem('سرطان الثدي', attributes.breast_cancer || 0)}
            ${createDiseaseItem('سرطان القولون', attributes.colon_cancer || 0)}
            ${createDiseaseItem('سرطان عنق الرحم', attributes.cervical_cancer || 0)}
        </div>
    `;

    document.getElementById('popupContent').innerHTML = content;
    popup.style.display = 'block';
}

// Create disease item for popup
function createDiseaseItem(name, count) {
    const percentage = count > 0 ? Math.round((count / 1000) * 100) : 0; // Example percentage calculation
    return `
        <div class="disease-card" style="padding: 0.75rem; position: relative;">
            <div class="disease-name">${name}</div>
            <div class="disease-count">${count || 0}</div>
            <div style="
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: var(--bg-tertiary);
                border-radius: 2px;
                overflow: hidden;
            ">
                <div style="
                    width: ${percentage}%;
                    height: 100%;
                    background: var(--primary-color);
                    transition: width 0.5s ease;
                "></div>
            </div>
                </div>
    `;
}

// Hide custom popup
function hideCustomPopup() {
    document.getElementById('customPopup').style.display = 'none';
}

// Calculate and display statistics
// Calculate and display statistics
async function calculateStatistics() {
    try {
        const query = layers.healthcareCenters.createQuery();
        query.where = "1=1";
        query.outStatistics = [
            {
                statisticType: "count",
                onStatisticField: "OBJECTID",
                outStatisticFieldName: "total_centers"
            },
            {
                statisticType: "sum",
                onStatisticField: "transfers_number",
                outStatisticFieldName: "total_transfers"
            },
            {
                statisticType: "avg",
                onStatisticField: "transfers_number",
                outStatisticFieldName: "avg_transfers"
            }
        ];

        const results = await layers.healthcareCenters.queryFeatures(query);
        if (results.features.length > 0) {
            const stats = results.features[0].attributes;
            
            // Update statistics with animation
            animateValue('totalCenters', 0, stats.total_centers, 2000);
            animateValue('totalTransfers', 0, stats.total_transfers, 2000);
            animateValue('avgTransfers', 0, Math.round(stats.avg_transfers), 2000);
            
            // Count active centers (based on facility_status field)
            const activeQuery = layers.healthcareCenters.createQuery();
            activeQuery.where = "facility_status = 'Active' OR facility_status = 'نشط'";
            
            try {
                const activeResults = await layers.healthcareCenters.queryFeatureCount(activeQuery);
                animateValue('activeCenters', 0, activeResults, 2000);
            } catch (error) {
                // If the query fails, count all centers as active
                console.log("Active centers query failed, counting all centers");
                animateValue('activeCenters', 0, stats.total_centers, 2000);
            }
        }

        // Calculate disease distribution
        calculateDiseaseDistribution();

        // Create chart after statistics are loaded
        createTopCentersChart();
    } catch (error) {
        console.error("Error calculating statistics:", error);
    }
}


// Calculate disease distribution
async function calculateDiseaseDistribution() {
    try {
        const diseases = [
            { field: 'thyroid_gland', name: 'الغدة الدرقية', icon: 'fa-thyroid' },
            { field: 'tlood_lipids', name: 'دهون الدم', icon: 'fa-tint' },
            { field: 'gallbladder', name: 'المرارة', icon: 'fa-liver' },
            { field: 'sickle_cell_anemia', name: 'فقر الدم المنجلي', icon: 'fa-dna' },
            { field: 'liver_disease', name: 'أمراض الكبد', icon: 'fa-liver' },
            { field: 'breast_cancer', name: 'سرطان الثدي', icon: 'fa-ribbon' },
            { field: 'colon_cancer', name: 'سرطان القولون', icon: 'fa-stethoscope' },
            { field: 'cervical_cancer', name: 'سرطان عنق الرحم', icon: 'fa-ribbon' }
        ];

        const diseaseGrid = document.getElementById('diseaseGrid');
        diseaseGrid.innerHTML = '';

        for (const disease of diseases) {
            const query = layers.healthcareCenters.createQuery();
            query.where = "1=1";
            query.outStatistics = [{
                statisticType: "sum",
                onStatisticField: disease.field,
                outStatisticFieldName: "total"
            }];

            const results = await layers.healthcareCenters.queryFeatures(query);
            if (results.features.length > 0) {
                const total = results.features[0].attributes.total || 0;
                
                const diseaseCard = document.createElement('div');
                diseaseCard.className = 'disease-card';
                diseaseCard.innerHTML = `
                    <div class="disease-icon">
                        <i class="fas ${disease.icon}"></i>
                    </div>
                    <div class="disease-name">${disease.name}</div>
                    <div class="disease-count" data-value="${total}">0</div>
                `;
                
                diseaseGrid.appendChild(diseaseCard);
                
                // Animate the count
                setTimeout(() => {
                    const countElement = diseaseCard.querySelector('.disease-count');
                    animateValue(countElement, 0, total, 1500);
                }, 100);
            }
        }
    } catch (error) {
        console.error("Error calculating disease distribution:", error);
    }
}


// Animate numeric values
function animateValue(elementOrId, start, end, duration) {
    const element = typeof elementOrId === 'string' 
        ? document.querySelector(`#${elementOrId} .stat-value`)
        : elementOrId;
        
    if (!element) return;

    const startTime = performance.now();
    const endValue = parseInt(end) || 0;
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = Math.floor(start + (endValue - start) * easeOutExpo(progress));
        element.textContent = current.toLocaleString('ar-SA');
        element.setAttribute('data-value', current);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// Easing function for smooth animation
function easeOutExpo(x) {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

// Initialize theme
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    currentTheme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon();
}

// Toggle theme
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    updateThemeIcon();
    
    // Update map basemap based on theme
    if (map) {
        map.basemap = currentTheme === 'dark' ? 'dark-gray-vector' : 'gray-vector';
    }
}

// Update theme icon
function updateThemeIcon() {
    const icon = document.querySelector('#themeToggle i');
    if (currentTheme === 'dark') {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
}

// Show/hide loading spinner
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    spinner.style.display = show ? 'flex' : 'none';
}

// Show notification
function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add styles for notification
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Handle window resize for responsive design
window.addEventListener('resize', () => {
    if (window.innerWidth <= 1024) {
        // Mobile view adjustments
        const sidePanel = document.querySelector('.side-panel');
        if (sidePanel) {
            // Add toggle button for mobile
            if (!document.getElementById('sidePanelToggle')) {
                const toggleBtn = document.createElement('button');
                toggleBtn.id = 'sidePanelToggle';
                toggleBtn.className = 'side-panel-toggle';
                toggleBtn.innerHTML = '<i class="fas fa-chart-bar"></i>';
                toggleBtn.style.cssText = `
                    position: fixed;
                    top: 50%;
                    right: 0;
                    transform: translateY(-50%);
                    background: var(--primary-color);
                    color: white;
                    border: none;
                    padding: 1rem 0.5rem;
                    border-radius: var(--radius-md) 0 0 var(--radius-md);
                    cursor: pointer;
                    z-index: 101;
                    box-shadow: var(--shadow-md);
                `;
                
                toggleBtn.addEventListener('click', () => {
                    sidePanel.classList.toggle('active');
                });
                
                document.body.appendChild(toggleBtn);
            }
        }
    } else {
        // Desktop view - remove toggle button
        const toggleBtn = document.getElementById('sidePanelToggle');
        if (toggleBtn) {
            toggleBtn.remove();
        }
        
        const sidePanel = document.querySelector('.side-panel');
        if (sidePanel) {
            sidePanel.classList.remove('active');
        }
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // ESC to close popup
    if (e.key === 'Escape') {
        hideCustomPopup();
    }
    
    // Ctrl/Cmd + / for search (future feature)
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        // Implement search functionality
    }
});

// Export data function
async function exportData() {
    try {
        const query = layers.healthcareCenters.createQuery();
        query.where = layers.healthcareCenters.definitionExpression || "1=1";
        query.outFields = ["*"];
        
        const results = await layers.healthcareCenters.queryFeatures(query);
        const data = results.features.map(f => f.attributes);
        
        // Convert to CSV
        const csv = convertToCSV(data);
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `healthcare_centers_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        showNotification('تم تصدير البيانات بنجاح');
    } catch (error) {
        console.error("Error exporting data:", error);
        showNotification('خطأ في تصدير البيانات', 'error');
    }
}

// Convert JSON to CSV
function convertToCSV(data) {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => {
        return headers.map(header => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',') 
                ? `"${value}"` 
                : value;
        }).join(',');
    });
    
    return [csvHeaders, ...csvRows].join('\n');
}

// Initialize the application
initializeHealthcareDashboard()
    .then(([returnedView, returnedMap]) => {
        console.log("Healthcare Dashboard initialized successfully");
        
        // Trigger initial resize check
        window.dispatchEvent(new Event('resize'));
        
        // Add export button (optional)
        const exportBtn = document.createElement('button');
        exportBtn.className = 'export-btn';
        exportBtn.innerHTML = '<i class="fas fa-download"></i> تصدير البيانات';
        exportBtn.style.cssText = `
            position: fixed;
            bottom: 2rem;
            left: 1rem;
            background: var(--accent-color);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: var(--radius-lg);
            cursor: pointer;
            box-shadow: var(--shadow-md);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: var(--transition);
            z-index: 99;
        `;
        
        exportBtn.addEventListener('click', exportData);
        exportBtn.addEventListener('mouseenter', () => {
            exportBtn.style.transform = 'translateY(-2px)';
            exportBtn.style.boxShadow = 'var(--shadow-lg)';
        });
        exportBtn.addEventListener('mouseleave', () => {
            exportBtn.style.transform = 'translateY(0)';
            exportBtn.style.boxShadow = 'var(--shadow-md)';
        });
        
        document.body.appendChild(exportBtn);
    })
    .catch((error) => {
        console.error("Failed to initialize dashboard:", error);
        showLoading(false);
        showNotification('خطأ في تحميل الخريطة', 'error');
    });


    // Add search functionality
// Add search functionality
function setupSearch(view) {
    const searchInput = document.getElementById('searchInput');
    const clearButton = document.getElementById('clearSearch');
    const searchResults = document.getElementById('searchResults');
    
    if (!searchInput || !clearButton || !searchResults) {
        console.error("Search elements not found in DOM");
        return;
    }
    
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        clearButton.style.display = value ? 'block' : 'none';
        
        clearTimeout(searchTimeout);
        if (value.length > 2) {
            searchTimeout = setTimeout(() => performSearch(value), 300);
        } else {
            searchResults.style.display = 'none';
        }
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearButton.style.display = 'none';
        searchResults.style.display = 'none';
    });

    async function performSearch(searchText) {
        try {
            const query = layers.healthcareCenters.createQuery();
            query.where = `facility_name LIKE '%${searchText}%' OR Sector LIKE '%${searchText}%' OR اسم_التجمع LIKE '%${searchText}%'`;
            query.outFields = ["*"];
            query.returnGeometry = true;

            const results = await layers.healthcareCenters.queryFeatures(query);
            displaySearchResults(results.features);
        } catch (error) {
            console.error("Search error:", error);
        }
    }

    function displaySearchResults(features) {
        searchResults.innerHTML = '';
        
        if (features.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item">لا توجد نتائج</div>';
        } else {
            features.slice(0, 10).forEach(feature => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                    <div class="search-result-name">${feature.attributes.facility_name || feature.attributes['اسم_التجمع']}</div>
                    <div class="search-result-info">
                        ${feature.attributes.Sector} • ${feature.attributes.transfers_number} تحويل
                    </div>
                `;
                
                item.addEventListener('click', () => {
                    view.goTo({
                        target: feature.geometry,
                        zoom: 15
                    }, {
                        duration: 1500
                    }).then(() => {
                        // Load Point module and show popup
                        loadModule("esri/geometry/Point").then((Point) => {
                            showCustomPopup(feature, Point);
                        });
                    });
                    searchResults.style.display = 'none';
                    searchInput.value = '';
                    clearButton.style.display = 'none';
                });
                
                searchResults.appendChild(item);
            });
        }
        
        searchResults.style.display = 'block';
    }

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.style.display = 'none';
        }
    });
}




// Add hover effect
function setupHoverEffect(view) {
    let highlight;
    let tooltip = createTooltip();

    view.on("pointer-move", async (event) => {
        const response = await view.hitTest(event);
        const results = response.results.filter(result => 
            result.graphic.layer === layers.healthcareCenters
        );

        if (results.length > 0) {
            const graphic = results[0].graphic;
            const screenPoint = view.toScreen(graphic.geometry);
            
            // Show tooltip
            tooltip.innerHTML = `
                <div style="font-weight: 600;">${graphic.attributes.facility_name || graphic.attributes['اسم_التجمع']}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    التحويلات: ${graphic.attributes.transfers_number}
                </div>
            `;
            tooltip.style.display = 'block';
            tooltip.style.left = screenPoint.x + 'px';
            tooltip.style.top = (screenPoint.y - 60) + 'px';
            
            document.body.style.cursor = 'pointer';
        } else {
            tooltip.style.display = 'none';
            document.body.style.cursor = 'default';
        }
    });

    function createTooltip() {
        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
            position: absolute;
            background: var(--bg-primary);
            padding: 0.5rem 0.75rem;
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-md);
            pointer-events: none;
            z-index: 99;
            display: none;
            transform: translateX(-50%);
        `;
        document.body.appendChild(tooltip);
        return tooltip;
    }
}


// Fixed print functionality
async function printMap() {
    try {
        showLoading(true);
        const [Print] = await Promise.all([
            loadModule("esri/widgets/Print")
        ]);

        // Create a temporary container for the print widget
        const printContainer = document.createElement('div');
        printContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-primary);
            padding: 2rem;
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-xl);
            z-index: 1000;
            min-width: 300px;
        `;
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = `
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: var(--bg-secondary);
            border: none;
            width: 2rem;
            height: 2rem;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        printContainer.appendChild(closeBtn);
        document.body.appendChild(printContainer);

        const print = new Print({
            view: view,
            container: printContainer,
            printServiceUrl: "https://utility.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task"
        });

        closeBtn.addEventListener('click', () => {
            print.destroy();
            printContainer.remove();
            showLoading(false);
        });

        showLoading(false);
    } catch (error) {
        console.error("Print error:", error);
        showLoading(false);
        showNotification('خطأ في الطباعة', 'error');
    }
}
// Add print button
const printBtn = document.createElement('button');
printBtn.className = 'control-btn print';
printBtn.id = 'printBtn';
printBtn.innerHTML = '<i class="fas fa-print"></i>';
printBtn.setAttribute('aria-label', 'طباعة الخريطة');
document.querySelector('.custom-controls').appendChild(printBtn);
printBtn.addEventListener('click', printMap);


// Add Chart.js to your HTML first
// <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

async function createTopCentersChart() {
    try {
        const query = layers.healthcareCenters.createQuery();
        query.where = "1=1";
        query.outFields = ["facility_name", "اسم_التجمع", "transfers_number"];
        query.orderByFields = ["transfers_number DESC"];
        query.num = 10;

        const results = await layers.healthcareCenters.queryFeatures(query);
        
        if (results.features.length === 0) {
            console.log("No features found for chart");
            return;
        }
        
        const labels = results.features.map(f => 
            f.attributes.facility_name || f.attributes['اسم_التجمع'] || 'غير محدد'
        );
        const data = results.features.map(f => f.attributes.transfers_number || 0);

        const ctx = document.getElementById('topCentersChart');
        if (!ctx) {
            console.error("Chart canvas not found");
            return;
        }

        // Check if chart exists and has destroy method before destroying
        if (window.topCentersChart && typeof window.topCentersChart.destroy === 'function') {
            window.topCentersChart.destroy();
        }

        // For Chart.js 3.x, use 'bar' type with indexAxis option for horizontal bars
        window.topCentersChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'عدد التحويلات',
                    data: data,
                    backgroundColor: 'rgba(37, 99, 235, 0.8)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // This makes the bar chart horizontal
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                family: 'Arial',
                                size: 11
                            }
                        }
                    },
                    y: {
                        ticks: {
                            font: {
                                family: 'Arial',
                                size: 10
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error creating chart:", error);
    }
}



// Add fullscreen functionality
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        showNotification('وضع ملء الشاشة');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// Add fullscreen button
const fullscreenBtn = document.createElement('button');
fullscreenBtn.className = 'control-btn fullscreen';
fullscreenBtn.id = 'fullscreenBtn';
fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
fullscreenBtn.setAttribute('aria-label', 'ملء الشاشة');
document.querySelector('.custom-controls').appendChild(fullscreenBtn);
fullscreenBtn.addEventListener('click', toggleFullscreen);

// Update icon on fullscreen change
document.addEventListener('fullscreenchange', () => {
    const icon = fullscreenBtn.querySelector('i');
    if (document.fullscreenElement) {
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-compress');
    } else {
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
    }
});


