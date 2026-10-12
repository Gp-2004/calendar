(() => {
  "use strict";

  const STORAGE_KEY = "daylight-calendar-events-v1";
  const calendarColors = {
    Personal: "personal",
    Work: "work",
    Family: "family",
    "Focus time": "focus-time"
  };
  const dateFormatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
  const shortDateFormatter = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" });
  const today = startOfDay(new Date());
  let currentDate = new Date(today);
  let selectedDate = new Date(today);
  let currentView = "month";
  let searchQuery = "";
  let editingId = null;
  let visibleCalendars = new Set(["Personal", "Work", "Family", "Focus time"]);
  let toastTimer;

  const elements = {
    currentMonth: document.querySelector("#current-month-label"),
    miniMonth: document.querySelector("#mini-month-label"),
    miniGrid: document.querySelector("#mini-calendar-grid"),
    viewport: document.querySelector("#calendar-viewport"),
    modal: document.querySelector("#event-modal"),
    form: document.querySelector("#event-form"),
    modalTitle: document.querySelector("#modal-title"),
    eventTitle: document.querySelector("#event-title"),
    eventDate: document.querySelector("#event-date"),
    eventCalendar: document.querySelector("#event-calendar"),
    eventStart: document.querySelector("#event-start"),
    eventEnd: document.querySelector("#event-end"),
    eventLocation: document.querySelector("#event-location"),
    modalError: document.querySelector("#modal-error"),
    deleteButton: document.querySelector("#delete-event"),
    searchInput: document.querySelector("#search-input"),
    toast: document.querySelector("#toast")
  };

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseLocalDateTime(value) {
    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }

  function makeSampleEvents() {
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const samples = [
      [2, "Morning pages & coffee", "08:30", "09:00", "Personal", "The little corner café"],
      [4, "Weekly team sync", "10:00", "11:00", "Work", "Studio · Meeting room"],
      [7, "Deep work block", "09:00", "11:00", "Focus time", "Quiet time, notifications off"],
      [9, "Lunch with Morgan", "12:30", "13:30", "Personal", "Juniper & Co."],
      [12, "Design review", "14:00", "15:00", "Work", "Video call"],
      [14, "Sunday dinner", "18:00", "19:30", "Family", "At home"],
      [17, "Project check-in", "09:30", "10:00", "Work", "Studio · Meeting room"],
      [20, "A little time outside", "16:30", "17:30", "Personal", "Riverside park"],
      [23, "Focus: Q4 planning", "10:00", "12:00", "Focus time", "Bring your favorite notebook"],
      [26, "Family movie night", "19:00", "21:00", "Family", "Pick the movie together"]
    ];
    return samples.map(([day, title, start, end, calendar, location], index) => {
      const eventDay = Math.min(day, daysInMonth);
      return {
        id: `sample-${index}`,
        title,
        start: `${dateKey(new Date(year, month, eventDay))}T${start}`,
        end: `${dateKey(new Date(year, month, eventDay))}T${end}`,
        calendar,
        location
      };
    });
  }

  function loadEvents() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) {
        const samples = makeSampleEvents();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
        return samples;
      }
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some(event => !isValidEvent(event))) {
        throw new Error("Saved calendar data is invalid.");
      }
      return parsed;
    } catch (error) {
      console.error("Could not load calendar events:", error);
      showToast("Your saved calendar could not be loaded.");
      return makeSampleEvents();
    }
  }

  function isValidEvent(event) {
    return event && typeof event.id === "string" && typeof event.title === "string" &&
      typeof event.start === "string" && typeof event.end === "string" &&
      Object.hasOwn(calendarColors, event.calendar);
  }

  let events = loadEvents();

  function saveEvents() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
      return true;
    } catch (error) {
      console.error("Could not save calendar events:", error);
      showToast("Could not save your event. Check browser storage settings.");
      return false;
    }
  }

  function startOfWeek(date) {
    const result = startOfDay(date);
    const weekday = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - weekday);
    return result;
  }

  function shiftMonth(date, amount) {
    const targetMonth = new Date(date.getFullYear(), date.getMonth() + amount, 1);
    const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
    return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(date.getDate(), lastDay));
  }

  function monthTitle(date) {
    return dateFormatter.format(date);
  }

  function eventMatches(event) {
    if (!visibleCalendars.has(event.calendar)) return false;
    if (!searchQuery) return true;
    const text = `${event.title} ${event.location || ""} ${event.calendar}`.toLowerCase();
    return text.includes(searchQuery);
  }

  function eventsForDay(date) {
    const key = dateKey(date);
    return events.filter(event => dateKey(parseLocalDateTime(event.start)) === key && eventMatches(event))
      .sort((first, second) => parseLocalDateTime(first.start) - parseLocalDateTime(second.start));
  }

  function eventTime(event, options = { hour: "numeric", minute: "2-digit" }) {
    return new Intl.DateTimeFormat("en", options).format(parseLocalDateTime(event.start));
  }

  function eventEndTime(event) {
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(parseLocalDateTime(event.end));
  }

  function render() {
    elements.currentMonth.textContent = monthTitle(currentDate);
    renderMiniCalendar();
    if (currentView === "month") renderMonth();
    else if (currentView === "week") renderTimeGrid(startOfWeek(currentDate), 7);
    else if (currentView === "day") renderTimeGrid(startOfDay(currentDate), 1);
    else renderAgenda();
    document.querySelectorAll(".view-switcher button").forEach(button => {
      const active = button.dataset.view === currentView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderMiniCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    elements.miniMonth.textContent = monthTitle(currentDate);
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
    const cells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dateKey(date);
      const classes = ["mini-day"];
      if (date.getMonth() !== month) classes.push("outside");
      if (key === dateKey(selectedDate)) classes.push("selected");
      if (key === dateKey(today)) classes.push("today");
      if (events.some(event => dateKey(parseLocalDateTime(event.start)) === key)) classes.push("has-event");
      return `<button class="${classes.join(" ")}" type="button" data-date="${key}" aria-label="${date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}">${date.getDate()}</button>`;
    }).join("");
    elements.miniGrid.innerHTML = cells;
  }

  function renderMonth() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
    const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let markup = `<div class="month-grid" role="grid" aria-label="${monthTitle(currentDate)}"><div class="weekday" role="columnheader">${weekdayNames.join('</div><div class="weekday" role="columnheader">')}</div>`;
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dateKey(date);
      const dayEvents = eventsForDay(date);
      const classes = ["month-cell"];
      if (date.getMonth() !== month) classes.push("outside-month");
      if (key === dateKey(today)) classes.push("today");
      markup += `<div class="${classes.join(" ")}" role="gridcell" data-date="${key}" tabindex="0" aria-label="${date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}"><div class="day-cell-top"><span class="day-number">${date.getDate()}</span></div><div class="month-events">`;
      dayEvents.slice(0, 3).forEach(event => {
        markup += `<button type="button" class="event-chip ${calendarColors[event.calendar]}" data-event-id="${escapeHtml(event.id)}" aria-label="${escapeHtml(event.title)}, ${eventTime(event)}"><span class="event-time">${eventTime(event, { hour: "numeric" })}</span><span class="event-name">${escapeHtml(event.title)}</span></button>`;
      });
      if (dayEvents.length > 3) markup += `<button type="button" class="more-events" data-date="${key}">+${dayEvents.length - 3} more</button>`;
      markup += "</div></div>";
    }
    elements.viewport.innerHTML = markup + "</div>";
  }

  function renderTimeGrid(start, count) {
    const dates = Array.from({ length: count }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
    const dayMode = count === 1;
    const labels = Array.from({ length: 12 }, (_, index) => `<span>${new Intl.DateTimeFormat("en", { hour: "numeric" }).format(new Date(2020, 0, 1, index + 7))}</span>`).join("");
    let markup = `<div class="time-grid ${dayMode ? "day-mode" : ""}"><div class="time-heading"></div>`;
    dates.forEach(date => {
      const classes = dateKey(date) === dateKey(today) ? "time-heading current" : "time-heading";
      markup += `<div class="${classes}">${dayMode ? date.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" }) : date.toLocaleDateString("en", { weekday: "short", day: "numeric" })}</div>`;
    });
    markup += `<div class="time-labels">${labels}</div>`;
    dates.forEach(date => {
      markup += '<div class="time-column">';
      eventsForDay(date).forEach(event => {
        const eventStart = parseLocalDateTime(event.start);
        const eventEnd = parseLocalDateTime(event.end);
        const startMinutes = eventStart.getHours() * 60 + eventStart.getMinutes();
        const endMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes();
        if (endMinutes <= 7 * 60 || startMinutes >= 19 * 60) return;
        const visibleStart = Math.max(startMinutes, 7 * 60);
        const visibleEnd = Math.min(endMinutes, 19 * 60);
        const top = (visibleStart - 7 * 60) / 60 * 48;
        const height = Math.max(28, (visibleEnd - visibleStart) / 60 * 48);
        markup += `<button class="time-event event-chip ${calendarColors[event.calendar]}" type="button" data-event-id="${escapeHtml(event.id)}" style="top:${top}px;height:${Math.min(height, 576 - top)}px"><strong>${escapeHtml(event.title)}</strong><span>${eventTime(event)} – ${eventEndTime(event)}</span></button>`;
      });
      markup += "</div>";
    });
    elements.viewport.innerHTML = markup + "</div>";
  }

  function renderAgenda() {
    const rangeStart = currentView === "agenda" ? startOfDay(currentDate) : startOfDay(currentDate);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 35);
    const matching = events.filter(event => {
      const date = parseLocalDateTime(event.start);
      return eventMatches(event) && date >= rangeStart && date < rangeEnd;
    }).sort((first, second) => parseLocalDateTime(first.start) - parseLocalDateTime(second.start));
    const grouped = new Map();
    matching.forEach(event => {
      const key = dateKey(parseLocalDateTime(event.start));
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    });
    if (!grouped.size) {
      elements.viewport.innerHTML = `<div class="agenda-view"><div class="agenda-empty">${searchQuery ? "No events match your search." : "No events coming up. Enjoy the breathing room."}</div></div>`;
      return;
    }
    let markup = '<div class="agenda-view">';
    grouped.forEach((dayEvents, key) => {
      const date = parseLocalDateTime(`${key}T00:00`);
      markup += `<section class="agenda-date-group"><div class="agenda-date-label"><strong>${date.getDate()}</strong>${date.toLocaleDateString("en", { weekday: "long", month: "short" })}</div><div class="agenda-events">`;
      dayEvents.forEach(event => {
        markup += `<article class="agenda-event" tabindex="0" data-event-id="${escapeHtml(event.id)}"><i class="agenda-stripe ${calendarColors[event.calendar]}"></i><div class="agenda-copy"><strong>${escapeHtml(event.title)}</strong><span>${eventTime(event)} – ${eventEndTime(event)}${event.location ? ` · ${escapeHtml(event.location)}` : ""}</span></div></article>`;
      });
      markup += "</div></section>";
    });
    elements.viewport.innerHTML = markup + "</div>";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function openModal(date = selectedDate, event = null) {
    editingId = event ? event.id : null;
    elements.modalTitle.textContent = editingId ? "Edit your event" : "Create an event";
    elements.eventTitle.value = event ? event.title : "";
    elements.eventDate.value = event ? event.start.slice(0, 10) : dateKey(date);
    elements.eventCalendar.value = event ? event.calendar : "Personal";
    elements.eventStart.value = event ? event.start.slice(11, 16) : "09:00";
    elements.eventEnd.value = event ? event.end.slice(11, 16) : "10:00";
    elements.eventLocation.value = event ? event.location || "" : "";
    elements.deleteButton.hidden = !editingId;
    elements.modalError.textContent = "";
    elements.modal.classList.add("open");
    elements.modal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => elements.eventTitle.focus(), 30);
  }

  function closeModal() {
    elements.modal.classList.remove("open");
    elements.modal.setAttribute("aria-hidden", "true");
    elements.form.reset();
    editingId = null;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2500);
  }

  function movePeriod(amount) {
    if (currentView === "day") currentDate.setDate(currentDate.getDate() + amount);
    else if (currentView === "week") currentDate.setDate(currentDate.getDate() + amount * 7);
    else currentDate = shiftMonth(currentDate, amount);
    selectedDate = new Date(currentDate);
    render();
  }

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(elements.form);
    const start = `${formData.get("date")}T${formData.get("start")}`;
    const end = `${formData.get("date")}T${formData.get("end")}`;
    if (parseLocalDateTime(end) <= parseLocalDateTime(start)) {
      elements.modalError.textContent = "End time must be later than the start time.";
      elements.eventEnd.focus();
      return;
    }
    const value = {
      id: editingId || `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: String(formData.get("title")).trim(),
      start,
      end,
      calendar: String(formData.get("calendar")),
      location: String(formData.get("location") || "").trim()
    };
    if (!value.title) {
      elements.modalError.textContent = "Add a title to save your event.";
      elements.eventTitle.focus();
      return;
    }
    const wasEditing = Boolean(editingId);
    const previousEvents = events;
    events = editingId ? events.map(item => item.id === editingId ? value : item) : [...events, value];
    if (!saveEvents()) {
      events = previousEvents;
      return;
    }
    selectedDate = parseLocalDateTime(start);
    currentDate = new Date(selectedDate);
    closeModal();
    render();
    showToast(wasEditing ? "Event updated. Looking good!" : "Event added to your calendar.");
  });

  elements.deleteButton.addEventListener("click", () => {
    if (!editingId) return;
    const previousEvents = events;
    events = events.filter(event => event.id !== editingId);
    if (!saveEvents()) {
      events = previousEvents;
      return;
    }
    closeModal();
    render();
    showToast("Event deleted.");
  });

  document.querySelector("#create-button").addEventListener("click", () => openModal(selectedDate));
  document.querySelector("#mobile-create").addEventListener("click", () => openModal(selectedDate));
  document.querySelector("#close-modal").addEventListener("click", closeModal);
  document.querySelector("#cancel-modal").addEventListener("click", closeModal);
  elements.modal.addEventListener("click", event => {
    if (event.target === elements.modal) closeModal();
  });
  document.querySelector("#previous-period").addEventListener("click", () => movePeriod(-1));
  document.querySelector("#next-period").addEventListener("click", () => movePeriod(1));
  document.querySelector("#today-button").addEventListener("click", () => {
    currentDate = new Date(today);
    selectedDate = new Date(today);
    render();
  });
  document.querySelectorAll(".mini-nav").forEach(button => button.addEventListener("click", () => {
    currentDate = shiftMonth(currentDate, Number(button.dataset.step));
    selectedDate = new Date(currentDate);
    render();
  }));
  document.querySelectorAll(".view-switcher button").forEach(button => button.addEventListener("click", () => {
    currentView = button.dataset.view;
    render();
  }));
  document.querySelectorAll(".calendar-option input").forEach(input => input.addEventListener("change", () => {
    if (input.checked) visibleCalendars.add(input.dataset.calendar);
    else visibleCalendars.delete(input.dataset.calendar);
    render();
  }));
  elements.searchInput.addEventListener("input", () => {
    searchQuery = elements.searchInput.value.trim().toLowerCase();
    render();
  });
  elements.searchInput.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      elements.searchInput.value = "";
      searchQuery = "";
      render();
      elements.searchInput.blur();
    }
  });
  document.querySelector("#filter-button").addEventListener("click", () => {
    document.querySelector(".calendar-list").scrollIntoView({ behavior: "smooth", block: "nearest" });
    showToast("Choose calendars to show from the sidebar.");
  });
  document.querySelector("#focus-tip").addEventListener("click", () => showToast("Try leaving a little space between meetings."));
  document.querySelector("#mobile-menu").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));

  elements.miniGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    const [year, month, day] = button.dataset.date.split("-").map(Number);
    selectedDate = new Date(year, month - 1, day);
    currentDate = new Date(selectedDate);
    render();
  });
  elements.viewport.addEventListener("click", event => {
    const eventElement = event.target.closest("[data-event-id]");
    if (eventElement) {
      const selectedEvent = events.find(item => item.id === eventElement.dataset.eventId);
      if (selectedEvent) openModal(parseLocalDateTime(selectedEvent.start), selectedEvent);
      return;
    }
    const moreButton = event.target.closest(".more-events");
    if (moreButton) {
      const [year, month, day] = moreButton.dataset.date.split("-").map(Number);
      selectedDate = new Date(year, month - 1, day);
      currentDate = new Date(selectedDate);
      currentView = "day";
      render();
      return;
    }
    const cell = event.target.closest(".month-cell");
    if (cell) {
      const [year, month, day] = cell.dataset.date.split("-").map(Number);
      selectedDate = new Date(year, month - 1, day);
      currentDate = new Date(selectedDate);
      render();
      openModal(selectedDate);
    }
  });
  elements.viewport.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const cell = event.target.closest(".month-cell");
    const agendaEvent = event.target.closest(".agenda-event");
    if (cell) {
      event.preventDefault();
      const [year, month, day] = cell.dataset.date.split("-").map(Number);
      selectedDate = new Date(year, month - 1, day);
      openModal(selectedDate);
    } else if (agendaEvent) {
      const selectedEvent = events.find(item => item.id === agendaEvent.dataset.eventId);
      if (selectedEvent) openModal(parseLocalDateTime(selectedEvent.start), selectedEvent);
    }
  });
  document.addEventListener("keydown", event => {
    if ((event.key === "n" || event.key === "N") && !event.ctrlKey && !event.metaKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      openModal(selectedDate);
    }
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.key === "Escape" && elements.modal.classList.contains("open")) closeModal();
    if (event.key === "Escape") document.querySelector("#sidebar").classList.remove("open");
  });

  document.querySelector("#current-time").textContent = new Intl.DateTimeFormat("en", {
    weekday: "short", month: "short", day: "numeric"
  }).format(today);
  render();
})();
