import { useEffect, useState } from "react";

function ResourceDropdown({ title, getList, getById }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [details, setDetails] = useState(null);

  useEffect(() => {
    getList()
      .then((data) => setItems(data))
      .catch(console.error);
  }, [getList]);

  const handleSelect = async (e) => {
    const id = e.target.value;
    setSelectedId(id);
    if (id) {
      const detailData = await getById(id);
      setDetails(detailData);
    } else {
      setDetails(null);
    }
  };

  const renderDetails = (obj) => {
    if (!obj) return null;
    return (
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>{title} Details</h3>
        <table style={styles.table}>
          <tbody>
            {Object.entries(obj).map(([key, value]) => (
              <tr key={key}>
                <td style={styles.keyCell}>{key}</td>
                <td style={styles.valueCell}>
                  {typeof value === "object" && value !== null
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>{title}</h2>

      <select style={styles.dropdown} value={selectedId} onChange={handleSelect}>
        <option value="">-- Select {title} --</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name || item.title || `ID: ${item.id}`}
          </option>
        ))}
      </select>

      {details && renderDetails(details)}
    </div>
  );
}

const styles = {
  container: {
    background: "#fdfdfd",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "2rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
    border: "1px solid #eee",
  },
  title: {
    marginBottom: "10px",
    fontSize: "1.3rem",
    fontWeight: "600",
    color: "#333",
  },
  dropdown: {
    padding: "10px 14px",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid #ccc",
    outline: "none",
    cursor: "pointer",
    marginBottom: "15px",
  },
  card: {
    marginTop: "20px",
    padding: "15px",
    borderRadius: "10px",
    background: "#fff",
    border: "1px solid #eee",
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
  },
  cardTitle: {
    fontSize: "1.1rem",
    marginBottom: "10px",
    color: "#444",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  keyCell: {
    background: "#f9f9f9",
    padding: "8px 12px",
    fontWeight: "600",
    border: "1px solid #eee",
    textTransform: "capitalize",
    width: "35%",
  },
  valueCell: {
    padding: "8px 12px",
    border: "1px solid #eee",
    color: "#555",
    whiteSpace: "pre-wrap", // allows multi-line JSON
  },
};

export default ResourceDropdown;
