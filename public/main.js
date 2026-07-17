// Custom JavaScript for TravelMap Landing Page

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    checkApiStatus();
    initTabs();
    initBookmarks();
    initAiPlanner();
});

// Navbar Scroll Effect and Mobile Menu
function initNavbar() {
    const navbar = document.getElementById('navbar');
    const mobileToggle = document.getElementById('mobile-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    // Scroll style change
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        
        // Active link highlighting
        let current = '';
        const sections = document.querySelectorAll('section');
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.scrollY >= (sectionTop - 150)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').slice(1) === current) {
                link.classList.add('active');
            }
        });
    });

    // Mobile Toggle
    mobileToggle.addEventListener('click', () => {
        navMenu.classList.toggle('show');
        const icon = mobileToggle.querySelector('i');
        if (navMenu.classList.contains('show')) {
            icon.className = 'fa-solid fa-xmark';
        } else {
            icon.className = 'fa-solid fa-bars';
        }
    });

    // Close menu when clicking link
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('show');
            mobileToggle.querySelector('i').className = 'fa-solid fa-bars';
        });
    });
}

// Check Backend API Connection Status
async function checkApiStatus() {
    const statusDot = document.querySelector('#api-status .status-dot');
    const statusText = document.querySelector('#api-status .status-text');

    if (!statusDot || !statusText) return;

    try {
        const response = await fetch('/', {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status) {
                statusDot.className = 'status-dot live';
                statusText.textContent = '';
                
                // If we get connection, let's load stats dynamically if we have them
                fetchLocalStats();
            } else {
                setOffline();
            }
        } else {
            setOffline();
        }
    } catch (error) {
        console.warn('Backend API connection check offline:', error);
        setOffline();
    }

    function setOffline() {
        if (statusDot) statusDot.className = 'status-dot offline';
        if (statusText) statusText.textContent = 'Server Status';
    }
}

// Fetch stats dynamically if backend database is online
async function fetchLocalStats() {
    // We try to request stats (the endpoint is auth protected normally, but just in case or to check server health)
    // Here we'll stick to displaying beautiful defaults but if the user has a local dev DB running, we are ready.
}

// Tabs Filtering for Destinations
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const cards = document.querySelectorAll('.dest-card');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');

            cards.forEach(card => {
                const categories = card.getAttribute('data-category').split(' ');
                if (filter === 'all' || categories.includes(filter)) {
                    card.style.display = 'flex';
                    card.style.animation = 'slideUp 0.5s ease forwards';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// Bookmark click actions
function initBookmarks() {
    const bookmarkBtns = document.querySelectorAll('.btn-circle');
    bookmarkBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const icon = btn.querySelector('i');
            if (icon.classList.contains('fa-regular')) {
                icon.className = 'fa-solid fa-bookmark';
                btn.style.borderColor = 'var(--primary)';
                btn.style.color = 'var(--primary)';
            } else {
                icon.className = 'fa-regular fa-bookmark';
                btn.style.borderColor = 'var(--border-color)';
                btn.style.color = 'var(--text-main)';
            }
        });
    });
}

// AI Planner Simulation Engine
function initAiPlanner() {
    const generateBtn = document.getElementById('btn-generate-itinerary');
    const outputScreen = document.getElementById('planner-output-screen');

    if (!generateBtn || !outputScreen) return;

    generateBtn.addEventListener('click', () => {
        const dest = document.getElementById('plan-destination').value || 'Kyoto, Japan';
        const days = document.getElementById('plan-days').value || '3';
        const style = document.getElementById('plan-style').value || 'culture';
        const budget = document.getElementById('plan-budget').value || 'moderate';

        generateBtn.disabled = true;
        outputScreen.innerHTML = ''; // Clear console

        const logs = [
            { text: `Initializing travel planner for ${dest}...`, type: 'info' },
            { text: `Loading parameters: duration=${days} days, style=${style}, budget=${budget}...`, type: 'info' },
            { text: `Connecting to TravelMap LLM Engine v2.5...`, type: 'info' },
            { text: `Resolving local coordinates and geo-coordinates...`, type: 'info' },
            { text: `Retrieving hidden gems & restaurants near ${dest}...`, type: 'info' },
            { text: `Filtering stays with verified rating > 4.5...`, type: 'success' },
            { text: `Running optimization search algorithm for route distance minimization...`, type: 'info' },
            { text: `Formatting response nodes into markdown schema...`, type: 'info' },
            { text: `Itinerary built successfully! Loading visualizer...`, type: 'success' }
        ];

        let logIndex = 0;
        
        function printLog() {
            if (logIndex < logs.length) {
                const log = logs[logIndex];
                const line = document.createElement('div');
                line.className = 'log-line';
                
                const time = document.createElement('span');
                time.className = 'log-time';
                time.textContent = `[${new Date().toTimeString().split(' ')[0]}]`;
                
                const typeText = document.createElement('span');
                if (log.type === 'info') {
                    typeText.className = 'log-info';
                    typeText.textContent = ' [INFO] ';
                } else if (log.type === 'success') {
                    typeText.className = 'log-success';
                    typeText.textContent = ' [SUCCESS] ';
                } else {
                    typeText.className = 'log-warn';
                    typeText.textContent = ' [WARN] ';
                }

                const msg = document.createElement('span');
                msg.textContent = log.text;

                line.appendChild(time);
                line.appendChild(typeText);
                line.appendChild(msg);
                outputScreen.appendChild(line);
                
                // Auto scroll console
                outputScreen.scrollTop = outputScreen.scrollHeight;

                logIndex++;
                setTimeout(printLog, 450 + Math.random() * 300);
            } else {
                // Done printing logs, show final beautiful Itinerary Card
                setTimeout(showItinerary, 600);
            }
        }

        printLog();

        function showItinerary() {
            const card = document.createElement('div');
            card.className = 'itinerary-card';
            
            // Build dynamic text based on user selections
            let dayPlans = '';
            
            if (days === '1') {
                dayPlans = `
                    <div class="itinerary-day">
                        <div class="day-title">Day 1: Express Exploration</div>
                        <ul class="day-items">
                            <li>09:00 AM - Historic Sanctuary Visit (Top Cultural Spot)</li>
                            <li>12:30 PM - Local Gastronomy & Street Food Curated Dining</li>
                            <li>03:00 PM - Hidden Panoramic Scenic Outlook Walk</li>
                            <li>06:30 PM - Riverbank sunset walk & tea house tasting</li>
                        </ul>
                    </div>
                `;
            } else if (days === '3') {
                dayPlans = `
                    <div class="itinerary-day">
                        <div class="day-title">Day 1: Arrival & Heart of the City</div>
                        <ul class="day-items">
                            <li>10:00 AM - Welcome walk through central historical streets</li>
                            <li>01:00 PM - Authentic artisanal dining experience</li>
                            <li>03:30 PM - Sunset over ancient local pagodas / skyscrapers</li>
                        </ul>
                    </div>
                    <div class="itinerary-day">
                        <div class="day-title">Day 2: The Hidden Path (Adventure & Stays)</div>
                        <ul class="day-items">
                            <li>07:30 AM - Sunrise bamboo forest pathway walk</li>
                            <li>12:00 PM - Mountain view cafe & vegan cuisine</li>
                            <li>04:00 PM - Partner-verified local arts & craft experience</li>
                        </ul>
                    </div>
                    <div class="itinerary-day">
                        <div class="day-title">Day 3: Scenic Retreat & Farewell</div>
                        <ul class="day-items">
                            <li>09:00 AM - Leisurely garden view or canal-side cycling</li>
                            <li>01:00 PM - Souvenir hunting & local marketplace</li>
                            <li>05:00 PM - High-end premium tea service / sky lounge view</li>
                        </ul>
                    </div>
                `;
            } else {
                dayPlans = `
                    <div class="itinerary-day">
                        <div class="day-title">Day 1 & 2: Main highlights and essential sights</div>
                        <ul class="day-items">
                            <li>Classic temple routes, central markets, and historical architectures</li>
                            <li>Special curated local dinner with folklore presentation</li>
                        </ul>
                    </div>
                    <div class="itinerary-day">
                        <div class="day-title">Day 3 & 4: Deep dive into secret gems & nature trails</div>
                        <ul class="day-items">
                            <li>Private guided tour through restricted nature reserves</li>
                            <li>Local homestay lodging & organic dining</li>
                        </ul>
                    </div>
                    <div class="itinerary-day">
                        <div class="day-title">Day 5: Luxury wellness, spas and departure</div>
                        <ul class="day-items">
                            <li>Traditional spring bath or luxury spa day</li>
                            <li>Private transfer to departures</li>
                        </ul>
                    </div>
                `;
            }

            card.innerHTML = `
                <h4>
                    <i class="fa-solid fa-compass animate-spin-slow"></i>
                    Your ${days}-Day Travel Route for ${dest}
                </h4>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px; text-transform: uppercase; font-weight: 700;">
                    Style: ${style} | Budget: ${budget}
                </p>
                ${dayPlans}
            `;
            
            outputScreen.appendChild(card);
            outputScreen.scrollTop = outputScreen.scrollHeight;
            generateBtn.disabled = false;
        }
    });
}
